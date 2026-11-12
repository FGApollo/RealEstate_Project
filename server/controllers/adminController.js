const { safeErrorMessage } = require('../services/httpError');
const { supabase } = require('../config/supabase');
const { listingDatabaseError } = require('../services/listingEntitlements');

const REVIEW_STATUSES = ['APPROVED', 'PENDING', 'HIDDEN', 'REJECTED'];

// GET /api/admin/reviews?status=ALL|APPROVED|PENDING|HIDDEN|REJECTED&page=&limit=
// Phân trang ở database; counts là tổng theo từng trạng thái để hiển thị trên bộ lọc.
const getAllReviews = async (req, res) => {
  try {
    const status = String(req.query.status || 'ALL').toUpperCase();
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    if ((status !== 'ALL' && !REVIEW_STATUSES.includes(status))
      || !Number.isInteger(page) || page < 1 || page > 10000
      || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({ error: 'Tham số danh sách đánh giá không hợp lệ.' });
    }

    let query = supabase
      .from('property_reviews')
      .select(`
        *,
        user:users!user_id(id, name, avatar, role),
        property:properties!property_id(id, title, address, price, property_type),
        images:property_review_images(id, image_url)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (status !== 'ALL') query = query.eq('status', status);

    const countFor = (value) => {
      let counter = supabase.from('property_reviews').select('id', { count: 'exact', head: true });
      if (value) counter = counter.eq('status', value);
      return counter;
    };
    const [list, total, ...byStatus] = await Promise.all([query, countFor(null), ...REVIEW_STATUSES.map(countFor)]);

    const failed = [list, total, ...byStatus].find((result) => result.error);
    if (failed) return res.status(500).json({ error: safeErrorMessage(failed.error) });

    const counts = { total: total.count || 0 };
    REVIEW_STATUSES.forEach((value, index) => { counts[value.toLowerCase()] = byStatus[index].count || 0; });
    return res.status(200).json({ items: list.data || [], total: list.count || 0, page, limit, status, counts });
  } catch (error) {
    console.error('Error in getAllReviews:', error);
    return res.status(500).json({ error: safeErrorMessage(error, 'Internal server error') });
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

    if (error) return res.status(500).json({ error: safeErrorMessage(error) });

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
    return res.status(500).json({ error: safeErrorMessage(error, 'Internal server error') });
  }
};

const trustScoreService = require('../services/trustScoreService');

const hideProperty = async (req, res) => {
  const { propertyId } = req.params;
  const adminId = req.user.id;

  try {
    const result = await trustScoreService.applyPropertyHiddenPenalty(propertyId, adminId);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in hideProperty:', error);
    return res.status(500).json({ error: safeErrorMessage(error, 'Internal server error') });
  }
};

const unhideProperty = async (req, res) => {
  const { propertyId } = req.params;

  try {
    const { data, error } = await supabase
      .from('properties')
      .update({ is_hidden: false })
      .eq('id', propertyId)
      .select()
      .single();

    if (error) {
      throw listingDatabaseError(error);
    }

    return res.status(200).json({
      success: true,
      message: 'Đã mở khóa hiển thị bài đăng thành công.',
      property: data
    });
  } catch (error) {
    console.error('Error in unhideProperty:', error);
    return res.status(error.statusCode || 500).json({ error: safeErrorMessage(error, 'Internal server error') });
  }
};

module.exports = { getAllReviews, updateReviewStatus, hideProperty, unhideProperty };
