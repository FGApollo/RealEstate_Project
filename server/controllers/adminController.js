const { supabase } = require('../config/supabase');

// 1. API xem danh sách KYC bị từ chối
// GET /api/admin/kyc/rejected?adminId=1
const getRejectedKyc = async (req, res) => {
  const { adminId } = req.query;

  try {
    // Fetch all verifications ordered by created_at descending
    const { data: verifications, error } = await supabase
      .from('identity_verifications')
      .select(`
        *,
        user:users!user_id(id, name, email, phone, avatar, role, verification_status, trust_score, created_at)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Only return the latest verification for each user, and only if status === 'REJECTED'
    const seenUserIds = new Set();
    const rejectedList = [];

    for (const item of (verifications || [])) {
      if (!item.user_id) continue;
      if (!seenUserIds.has(item.user_id)) {
        seenUserIds.add(item.user_id);
        if (item.status === 'REJECTED') {
          rejectedList.push(item);
        }
      }
    }

    return res.status(200).json(rejectedList);
  } catch (err) {
    console.error('Error in getRejectedKyc:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

// 2. API xem chi tiết một hồ sơ KYC
// GET /api/admin/kyc/:verificationId?adminId=1
const getKycDetail = async (req, res) => {
  const { verificationId } = req.params;

  try {
    const { data: verification, error } = await supabase
      .from('identity_verifications')
      .select(`
        *,
        user:users!user_id(*)
      `)
      .eq('id', verificationId)
      .single();

    if (error || !verification) {
      return res.status(404).json({ error: 'Hồ sơ KYC không tồn tại' });
    }

    // Fetch reviewer information if reviewed_by is present
    let reviewer = null;
    if (verification.reviewed_by) {
      const { data: reviewerData } = await supabase
        .from('users')
        .select('id, name, email, role, avatar')
        .eq('id', verification.reviewed_by)
        .maybeSingle();
      reviewer = reviewerData || null;
    }

    return res.status(200).json({
      ...verification,
      reviewer
    });
  } catch (err) {
    console.error('Error in getKycDetail:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

// 3. API admin duyệt KYC
// POST /api/admin/kyc/:verificationId/approve
// Body: { "adminId": 1 }
const approveKyc = async (req, res) => {
  const { verificationId } = req.params;
  const { adminId } = req.body;

  if (!adminId) {
    return res.status(400).json({ error: 'Thiếu adminId trong body' });
  }

  try {
    // 1. Fetch current verification
    const { data: verification, error: fetchErr } = await supabase
      .from('identity_verifications')
      .select('*')
      .eq('id', verificationId)
      .single();

    if (fetchErr || !verification) {
      return res.status(404).json({ error: 'Hồ sơ KYC không tồn tại' });
    }

    if (verification.status !== 'REJECTED' && verification.status !== 'PENDING') {
      return res.status(400).json({ error: `Không thể duyệt hồ sơ đang có trạng thái: ${verification.status}` });
    }

    // 2. Check if user has ever been approved before
    // "Nếu chưa có log KYC_APPROVED, hệ thống cộng +20 trust_score"
    // "Ghi chú: Nếu hồ sơ đã được approve trước đó, hệ thống không cộng lại trust score."
    const { data: approvedHistory } = await supabase
      .from('identity_verifications')
      .select('id')
      .eq('user_id', verification.user_id)
      .eq('status', 'APPROVED')
      .limit(1);

    const { data: userRecord } = await supabase
      .from('users')
      .select('id, verification_status, trust_score')
      .eq('id', verification.user_id)
      .single();

    const hasBeenApprovedBefore = (approvedHistory && approvedHistory.length > 0) || (userRecord && userRecord.verification_status === 'VERIFIED');

    const now = new Date().toISOString();

    // 3. Update identity_verifications
    const { error: updVerErr } = await supabase
      .from('identity_verifications')
      .update({
        status: 'APPROVED',
        reject_reason: null,
        reviewed_by: adminId,
        reviewed_at: now
      })
      .eq('id', verificationId);

    if (updVerErr) {
      return res.status(500).json({ error: updVerErr.message || 'Lỗi khi cập nhật trạng thái hồ sơ KYC' });
    }

    // 4. Update users table
    const currentTrustScore = userRecord ? (userRecord.trust_score || 0) : 0;
    const newTrustScore = hasBeenApprovedBefore ? currentTrustScore : currentTrustScore + 20;

    const { error: updUserErr } = await supabase
      .from('users')
      .update({
        verification_status: 'VERIFIED',
        trust_score: newTrustScore
      })
      .eq('id', verification.user_id);

    if (updUserErr) {
      return res.status(500).json({ error: updUserErr.message || 'Lỗi khi cập nhật trạng thái user' });
    }

    return res.status(200).json({
      success: true,
      message: 'Duyệt hồ sơ KYC thành công',
      verificationId,
      userId: verification.user_id,
      trustScoreAdded: !hasBeenApprovedBefore ? 20 : 0,
      newTrustScore
    });
  } catch (err) {
    console.error('Error in approveKyc:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

// 4. API admin từ chối KYC
// POST /api/admin/kyc/:verificationId/reject
// Body: { "adminId": 1, "rejectReason": "Anh CCCD khong ro" }
const rejectKyc = async (req, res) => {
  const { verificationId } = req.params;
  const { adminId, rejectReason } = req.body;

  if (!adminId) {
    return res.status(400).json({ error: 'Thiếu adminId trong body' });
  }

  try {
    const { data: verification, error: fetchErr } = await supabase
      .from('identity_verifications')
      .select('*')
      .eq('id', verificationId)
      .single();

    if (fetchErr || !verification) {
      return res.status(404).json({ error: 'Hồ sơ KYC không tồn tại' });
    }

    const now = new Date().toISOString();
    const reasonToSave = rejectReason || 'Hồ sơ KYC không hợp lệ hoặc ảnh chụp không rõ ràng';

    // 1. Update identity_verifications
    const { error: updVerErr } = await supabase
      .from('identity_verifications')
      .update({
        status: 'REJECTED',
        reject_reason: reasonToSave,
        reviewed_by: adminId,
        reviewed_at: now
      })
      .eq('id', verificationId);

    if (updVerErr) {
      return res.status(500).json({ error: updVerErr.message || 'Lỗi khi từ chối hồ sơ KYC' });
    }

    // 2. Update users table: verification_status = REJECTED, KHÔNG trừ trust_score
    const { error: updUserErr } = await supabase
      .from('users')
      .update({
        verification_status: 'REJECTED'
      })
      .eq('id', verification.user_id);

    if (updUserErr) {
      return res.status(500).json({ error: updUserErr.message || 'Lỗi khi cập nhật trạng thái user' });
    }

    return res.status(200).json({
      success: true,
      message: 'Từ chối hồ sơ KYC thành công',
      verificationId,
      userId: verification.user_id,
      rejectReason: reasonToSave
    });
  } catch (err) {
    console.error('Error in rejectKyc:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

// ==========================================
// API Review Moderation (Kiểm duyệt đánh giá)
// ==========================================

// GET /api/admin/reviews
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

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(reviews || []);
  } catch (err) {
    console.error('Error in getAllReviews:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

// POST /api/admin/reviews/:reviewId/status
// Body: { "status": "APPROVED" | "REJECTED" | "REMOVED" }
const updateReviewStatus = async (req, res) => {
  const { reviewId } = req.params;
  const { status } = req.body;

  if (!status || !['APPROVED', 'REJECTED', 'REMOVED'].includes(status)) {
    return res.status(400).json({ error: 'Trạng thái đánh giá không hợp lệ (APPROVED, REJECTED, REMOVED)' });
  }

  try {
    const { data: updatedReview, error } = await supabase
      .from('property_reviews')
      .update({ status })
      .eq('id', reviewId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Recalculate property average rating if property_id exists
    if (updatedReview && updatedReview.property_id) {
      const { data: approvedReviews } = await supabase
        .from('property_reviews')
        .select('rating')
        .eq('property_id', updatedReview.property_id)
        .eq('status', 'APPROVED');

      const count = approvedReviews ? approvedReviews.length : 0;
      const avg = count > 0 ? approvedReviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;

      await supabase
        .from('properties')
        .update({
          average_rating: avg,
          review_count: count
        })
        .eq('id', updatedReview.property_id);
    }

    return res.status(200).json({
      success: true,
      message: `Cập nhật trạng thái đánh giá thành: ${status}`,
      review: updatedReview
    });
  } catch (err) {
    console.error('Error in updateReviewStatus:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

module.exports = {
  getRejectedKyc,
  getKycDetail,
  approveKyc,
  rejectKyc,
  getAllReviews,
  updateReviewStatus
};
