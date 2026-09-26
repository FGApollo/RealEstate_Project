const { supabase } = require('../config/supabase');

const getAllReviews = async (req, res) => {
  try {
    const { data: reviews, error } = await supabase
      .from('property_reviews')
      .select(`
        *,
        user:users!user_id(id, name, avatar, role),
        property:properties!property_id(id, title, address, price, property_type),
        images:property_review_images(id, image_url)
      `)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(reviews || []);
  } catch (error) {
    console.error('Error in getAllReviews:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

const updateReviewStatus = async (req, res) => {
  const { reviewId } = req.params;
  const { status } = req.body;

  let normalizedStatus = (status || '').toUpperCase();
  if (normalizedStatus === 'REMOVED') normalizedStatus = 'HIDDEN';

  if (!['APPROVED', 'REJECTED', 'HIDDEN', 'PENDING'].includes(normalizedStatus)) {
    return res.status(400).json({ error: 'Trạng thái đánh giá không hợp lệ (APPROVED, REJECTED, HIDDEN, PENDING)' });
  }

  try {
    const { data: updatedReview, error } = await supabase
      .from('property_reviews')
      .update({ status: normalizedStatus })
      .eq('id', reviewId)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    if (updatedReview?.property_id) {
      const { data: approvedReviews } = await supabase
        .from('property_reviews')
        .select('rating')
        .eq('property_id', updatedReview.property_id)
        .eq('status', 'APPROVED');

      const count = approvedReviews?.length || 0;
      const average = count
        ? approvedReviews.reduce((sum, review) => sum + review.rating, 0) / count
        : 0;

      await supabase
        .from('properties')
        .update({ average_rating: average, review_count: count })
        .eq('id', updatedReview.property_id);
    }

    return res.status(200).json({
      success: true,
      message: `Cập nhật trạng thái đánh giá thành: ${status}`,
      review: updatedReview
    });
  } catch (error) {
    console.error('Error in updateReviewStatus:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

module.exports = { getAllReviews, updateReviewStatus };
