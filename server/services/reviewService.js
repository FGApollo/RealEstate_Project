const { supabase } = require('../config/supabase');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const saveBase64Image = async (base64Str) => {
  const isPlaceholder = !base64Str || base64Str === 'https://via.placeholder.com/400';
  
  if (isPlaceholder) {
    return base64Str;
  }

  if (typeof base64Str === 'string' && (base64Str.startsWith('http://') || base64Str.startsWith('https://') || base64Str.startsWith('/uploads/'))) {
    return base64Str;
  }

  if (typeof base64Str !== 'string' || !base64Str.startsWith('data:image/')) {
    return base64Str;
  }

  try {
    const matches = base64Str.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return base64Str;
    }

    const imageType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `${crypto.randomUUID()}.${imageType}`;

    // 1. Try Supabase Storage 'property-images' bucket under 'reviews/' folder
    try {
      const BUCKET = 'property-images';
      const filePath = `reviews/${filename}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, buffer, {
          contentType: `image/${imageType}`,
          upsert: true
        });

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(filePath);
        if (urlData?.publicUrl) {
          console.log('Successfully uploaded review image to Supabase Storage:', urlData.publicUrl);
          return urlData.publicUrl;
        }
      } else {
        console.warn('Supabase review image upload failed, falling back to local file storage:', uploadError.message);
      }
    } catch (storageErr) {
      console.warn('Supabase review storage error:', storageErr.message);
    }

    // 2. Local fallback
    const uploadDir = path.join(__dirname, '../public/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filepath = path.join(uploadDir, filename);
    fs.writeFileSync(filepath, buffer);

    return `http://localhost:3000/uploads/${filename}`;
  } catch (err) {
    console.error('Error saving base64 image:', err);
    return base64Str;
  }
};

const getPropertyReviews = async (propertyId, currentUserId = null) => {
  const { data, error } = await supabase
    .from('property_reviews')
    .select(`
      *,
      user:users!user_id(name, avatar, role),
      images:property_review_images(image_url),
      replies:property_review_replies(
        id,
        review_id,
        user_id,
        reply_text,
        created_at,
        user:users!user_id(id, name, avatar, role)
      ),
      helpful_votes:property_review_helpful_votes(
        id,
        user_id
      )
    `)
    .eq('property_id', propertyId)
    .eq('status', 'APPROVED')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(r => {
    const votes = r.helpful_votes || [];
    return {
      ...r,
      helpful_count: votes.length,
      user_has_voted: currentUserId ? votes.some(v => Number(v.user_id) === Number(currentUserId)) : false
    };
  });
};

const checkUserVerifiedTransaction = async (userId, propertyId) => {
  try {
    const pId = parseInt(propertyId);
    const uId = parseInt(userId);

    // 1. Check in property_leads for a closed deal
    const { data: lead, error: leadError } = await supabase
      .from('property_leads')
      .select('id')
      .eq('property_id', pId)
      .eq('user_id', uId)
      .eq('status', 'CLOSED')
      .limit(1);

    if (!leadError && lead && lead.length > 0) {
      return true;
    }

    // 2. Check in property_transactions if table exists
    try {
      const { data: txn, error: txnError } = await supabase
        .from('property_transactions')
        .select('id')
        .eq('property_id', pId)
        .eq('user_id', uId)
        .in('status', ['COMPLETED', 'PAID', 'SUCCESS'])
        .limit(1);

      if (!txnError && txn && txn.length > 0) {
        return true;
      }
    } catch {
      // Ignore if table does not exist
    }

    return false;
  } catch (err) {
    console.error('Error checking user verified transaction:', err);
    return false;
  }
};

const createPropertyReview = async (propertyId, userId, rating, comment, images = [], customIsVerified = null) => {
  const pId = parseInt(propertyId);
  const uId = parseInt(userId);

  // 1. Validate property exists and reviewer is not the owner
  const { data: property, error: propError } = await supabase
    .from('properties')
    .select('id, owner_id')
    .eq('id', pId)
    .single();

  if (propError || !property) {
    const error = new Error('Bất động sản không tồn tại');
    error.statusCode = 404;
    throw error;
  }

  if (property.owner_id === uId) {
    const error = new Error('Chủ sở hữu không thể tự đánh giá bất động sản của mình');
    error.statusCode = 403;
    throw error;
  }

  // 2. Check duplicate review: each user can only review once
  const { data: existingReview } = await supabase
    .from('property_reviews')
    .select('id')
    .eq('property_id', pId)
    .eq('user_id', uId)
    .maybeSingle();

  if (existingReview) {
    const error = new Error('Bạn đã đánh giá bất động sản này rồi! Mỗi tài khoản chỉ được đánh giá một lần.');
    error.statusCode = 400;
    throw error;
  }

  // 3. Determine verified status from actual transaction in database
  const isVerifiedReview = customIsVerified !== null 
    ? Boolean(customIsVerified) 
    : await checkUserVerifiedTransaction(uId, pId);

  // 4. Insert review
  const { data: review, error: insError } = await supabase
    .from('property_reviews')
    .insert([{
      property_id: pId,
      user_id: uId,
      rating: parseInt(rating),
      comment: comment || '',
      status: 'APPROVED',
      is_verified_review: isVerifiedReview
    }])
    .select()
    .single();

  if (insError) {
    console.error('Supabase review insert error:', insError);
    throw new Error(insError.message);
  }

  // 5. Insert review images if provided
  if (images && images.length > 0) {
    const savedUrls = await Promise.all(images.map((img) => saveBase64Image(img)));
    const imageRecords = savedUrls.map((url, index) => ({
      review_id: review.id,
      image_url: url,
      sort_order: index
    }));

    const { error: imgError } = await supabase
      .from('property_review_images')
      .insert(imageRecords);

    if (imgError) {
      console.error('Error inserting review images:', imgError);
      throw new Error(imgError.message);
    }
  }

  // 6. Fetch all reviews to recalculate stats
  const { data: allReviews, error: fetchError } = await supabase
    .from('property_reviews')
    .select('rating')
    .eq('property_id', pId)
    .eq('status', 'APPROVED');

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const reviewCount = allReviews.length;
  const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount;

  // 7. Update properties table
  const { error: updError } = await supabase
    .from('properties')
    .update({
      average_rating: avgRating,
      review_count: reviewCount
    })
    .eq('id', pId);

  if (updError) {
    console.error('Error updating property stats:', updError);
    throw new Error(updError.message);
  }

  // 8. Fetch and return complete review with user and images details
  const { data: finalReview, error: finalError } = await supabase
    .from('property_reviews')
    .select(`
      *,
      user:users!user_id(name, avatar, role),
      images:property_review_images(image_url)
    `)
    .eq('id', review.id)
    .single();

  if (finalError) {
    throw new Error(finalError.message);
  }

  return finalReview;
};

const createReviewReply = async (reviewId, userId, replyText) => {
  const rId = parseInt(reviewId);
  const uId = parseInt(userId);

  if (isNaN(rId)) {
    const error = new Error('Mã đánh giá không hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  if (!replyText || !replyText.trim()) {
    const error = new Error('Nội dung phản hồi không được để trống');
    error.statusCode = 400;
    throw error;
  }

  // 1. Fetch review and associated property to verify existence
  const { data: review, error: revError } = await supabase
    .from('property_reviews')
    .select(`
      id,
      property_id,
      property:properties!property_id(id, owner_id)
    `)
    .eq('id', rId)
    .single();

  if (revError || !review) {
    const error = new Error('Đánh giá không tồn tại');
    error.statusCode = 404;
    throw error;
  }

  // 2. Insert into property_review_replies (open to all authenticated users)
  const { data: insertedReply, error: insError } = await supabase
    .from('property_review_replies')
    .insert([{
      review_id: rId,
      user_id: uId,
      reply_text: replyText.trim()
    }])
    .select(`
      id,
      review_id,
      user_id,
      reply_text,
      created_at,
      user:users!user_id(id, name, avatar, role)
    `)
    .single();

  if (insError) {
    console.error('Error inserting review reply:', insError);
    throw new Error(insError.message);
  }

  const isOwner = Boolean(review.property && review.property.owner_id === uId);

  return {
    ...insertedReply,
    is_owner: isOwner
  };
};

const toggleReviewHelpful = async (reviewId, userId) => {
  const rId = parseInt(reviewId, 10);
  const uId = parseInt(userId, 10);

  if (!rId || isNaN(rId)) {
    const error = new Error('Mã đánh giá không hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  // 1. Verify review exists
  const { data: review, error: revError } = await supabase
    .from('property_reviews')
    .select('id')
    .eq('id', rId)
    .single();

  if (revError || !review) {
    const error = new Error('Đánh giá không tồn tại');
    error.statusCode = 404;
    throw error;
  }

  // 2. Check if user already voted
  const { data: existingVote, error: checkError } = await supabase
    .from('property_review_helpful_votes')
    .select('id')
    .eq('review_id', rId)
    .eq('user_id', uId)
    .maybeSingle();

  if (checkError) {
    throw new Error(checkError.message);
  }

  let hasVoted = false;
  if (existingVote) {
    // Already voted -> Unvote (remove)
    const { error: delError } = await supabase
      .from('property_review_helpful_votes')
      .delete()
      .eq('id', existingVote.id);
    if (delError) throw new Error(delError.message);
    hasVoted = false;
  } else {
    // Has not voted -> Vote (insert)
    const { error: insError } = await supabase
      .from('property_review_helpful_votes')
      .insert([{ review_id: rId, user_id: uId }]);
    if (insError) throw new Error(insError.message);
    hasVoted = true;
  }

  // 3. Count total helpful votes for this review
  const { count, error: countError } = await supabase
    .from('property_review_helpful_votes')
    .select('*', { count: 'exact', head: true })
    .eq('review_id', rId);

  if (countError) throw new Error(countError.message);

  return {
    review_id: rId,
    has_voted: hasVoted,
    helpful_count: count || 0
  };
};

module.exports = {
  getPropertyReviews,
  createPropertyReview,
  checkUserVerifiedTransaction,
  createReviewReply,
  toggleReviewHelpful
};

