const { supabase } = require('../config/supabase');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const saveBase64Image = (base64Str) => {
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

const getPropertyReviews = async (propertyId) => {
  const { data, error } = await supabase
    .from('property_reviews')
    .select(`
      *,
      user:users!user_id(name, avatar, role),
      images:property_review_images(image_url)
    `)
    .eq('property_id', propertyId)
    .eq('status', 'APPROVED')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }
  return data;
};

const createPropertyReview = async (propertyId, userId, rating, comment, isVerifiedReview = false, images = []) => {
  // 1. Insert review
  const { data: review, error: insError } = await supabase
    .from('property_reviews')
    .insert([{
      property_id: parseInt(propertyId),
      user_id: parseInt(userId),
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

  // 2. Insert review images if provided
  if (images && images.length > 0) {
    const imageRecords = images.map((img, index) => ({
      review_id: review.id,
      image_url: saveBase64Image(img),
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

  // 3. Fetch all reviews to recalculate stats
  const { data: allReviews, error: fetchError } = await supabase
    .from('property_reviews')
    .select('rating')
    .eq('property_id', propertyId)
    .eq('status', 'APPROVED');

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const reviewCount = allReviews.length;
  const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount;

  // 4. Update properties table
  const { error: updError } = await supabase
    .from('properties')
    .update({
      average_rating: avgRating,
      review_count: reviewCount
    })
    .eq('id', propertyId);

  if (updError) {
    console.error('Error updating property stats:', updError);
    throw new Error(updError.message);
  }

  // 5. Fetch and return complete review with user and images details
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

module.exports = {
  getPropertyReviews,
  createPropertyReview
};
