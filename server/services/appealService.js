const { supabase } = require('../config/supabase');
const trustScoreService = require('./trustScoreService');
const crypto = require('crypto');
const { normalizeImageFile } = require('./imageValidation');
const { EVIDENCE_BUCKET } = require('./evidenceStorage');

const saveEvidenceImage = async (file, agentId) => {
  if (!Number.isSafeInteger(Number(agentId)) || Number(agentId) <= 0) {
    throw Object.assign(new Error('Invalid evidence owner'), { statusCode: 400 });
  }
  await normalizeImageFile(file);
  const objectPath = `evidence/${agentId}/${crypto.randomUUID()}.${file.extension}`;
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(objectPath, file.buffer, {
    contentType: file.mimetype, upsert: false
  });
  if (error) throw new Error('Could not store appeal evidence');
  return objectPath;
};

const parseEvidenceUrls = (evidenceUrl) => {
  if (!evidenceUrl) return [];
  if (Array.isArray(evidenceUrl)) return evidenceUrl.filter(Boolean);
  if (typeof evidenceUrl === 'string') {
    const trimmed = evidenceUrl.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch (e) {}
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [trimmed];
  }
  return [];
};

const submitAppeal = async ({ reportId, agentId, reason, evidenceUrl, evidenceUrls }) => {
  const { validateEvidenceReferences, signEvidenceUrls } = require('./evidenceStorage');
  const { positiveId, text, badRequest } = require('./businessValidation');
  reportId = positiveId(reportId, 'reportId');
  reason = text(reason, 'reason', 5000, { required: true });
  validateEvidenceReferences(parseEvidenceUrls(evidenceUrls || evidenceUrl), agentId);
  if (!reportId || !agentId || !reason?.trim()) {
    const error = new Error('Vui lòng cung cấp đầy đủ mã báo cáo và lý do giải trình.');
    error.statusCode = 400;
    throw error;
  }

  // 1. Get the report and verify ownership
  const { data: report, error: reportErr } = await supabase
    .from('property_reports')
    .select('id, property_id, status, reason, property:properties(id, owner_id, title)')
    .eq('id', reportId)
    .single();

  if (reportErr || !report) {
    const error = new Error('Không tìm thấy báo cáo vi phạm.');
    error.statusCode = 404;
    throw error;
  }

  if (report.status !== 'RESOLVED') {
    const error = new Error('Chỉ có thể khiếu nại đối với báo cáo đã bị xử phạt (RESOLVED).');
    error.statusCode = 400;
    throw error;
  }

  if (Number(report.property?.owner_id) !== Number(agentId)) {
    const error = new Error('Bạn không có quyền khiếu nại báo cáo cho bài đăng của người khác.');
    error.statusCode = 403;
    throw error;
  }

  // 2. Check if an appeal already exists for this report
  const { data: existingAppeal, error: checkErr } = await supabase
    .from('property_report_appeals')
    .select('id, status')
    .eq('report_id', reportId)
    .maybeSingle();

  if (checkErr && checkErr.code !== 'PGRST116') {
    throw new Error(checkErr.message);
  }

  if (existingAppeal) {
    const error = new Error(`Báo cáo này đã có đơn khiếu nại (Trạng thái: ${existingAppeal.status}).`);
    error.statusCode = 400;
    throw error;
  }

  // Determine final evidence url string (single URL string or JSON array string)
  let finalEvidenceUrl = null;
  const list = parseEvidenceUrls(evidenceUrls || evidenceUrl);
  if (list.length > 1) {
    finalEvidenceUrl = JSON.stringify(list);
  } else if (list.length === 1) {
    finalEvidenceUrl = list[0];
  }

  // 3. Create the appeal record
  const { data: newAppeal, error: insertErr } = await supabase
    .from('property_report_appeals')
    .insert({
      report_id: reportId,
      agent_id: agentId,
      reason: reason.trim(),
      evidence_url: finalEvidenceUrl,
      status: 'PENDING'
    })
    .select()
    .single();

  if (insertErr) {
    throw new Error(insertErr.message);
  }

  return {
    success: true,
    message: 'Gửi đơn khiếu nại thành công! Vui lòng chờ Quản trị viên xem xét.',
    appeal: {
      ...newAppeal,
      evidence_url: null,
      evidence_urls: await signEvidenceUrls(parseEvidenceUrls(newAppeal.evidence_url))
    }
  };
};

const getAgentViolations = async (agentId) => {
  // 1. Get properties owned by this agent
  const { data: properties, error: propErr } = await supabase
    .from('properties')
    .select('id, title, thumbnail, price, is_hidden')
    .eq('owner_id', agentId);

  if (propErr) throw new Error(propErr.message);
  if (!properties || properties.length === 0) return { violations: [] };

  const propMap = new Map(properties.map(p => [p.id, p]));
  const propIds = properties.map(p => p.id);

  // 2. Get reports on these properties
  const { data: reports, error: reportErr } = await supabase
    .from('property_reports')
    .select('*')
    .in('property_id', propIds)
    .order('created_at', { ascending: false });

  if (reportErr) throw new Error(reportErr.message);
  if (!reports || reports.length === 0) return { violations: [] };

  const reportIds = reports.map(r => r.id);

  // 3. Get any appeals submitted for these reports
  const { data: appeals, error: appealErr } = await supabase
    .from('property_report_appeals')
    .select('*')
    .in('report_id', reportIds);

  if (appealErr) throw new Error(appealErr.message);

  const appealMap = new Map((appeals || []).map(a => [a.report_id, a]));

  const { signEvidenceUrls } = require('./evidenceStorage');
  const violations = await Promise.all(reports.map(async (rep) => {
    // Reporting identity is visible only to moderators, never the accused agent.
    const { reporter_id, reporter, ...safeReport } = rep;
    const rawAppeal = appealMap.get(rep.id) || null;
    const appeal = rawAppeal ? {
      ...rawAppeal,
      evidence_url: null,
      evidence_urls: await signEvidenceUrls(parseEvidenceUrls(rawAppeal.evidence_url))
    } : null;
    return {
      ...safeReport,
      property: propMap.get(rep.property_id) || null,
      appeal
    };
  }));

  return { violations };
};

const getAdminAppeals = async (status) => {
  const { badRequest } = require('./businessValidation');
  if (status !== undefined && (typeof status !== 'string'
    || !['PENDING', 'APPROVED', 'REJECTED', 'ALL'].includes(status))) throw badRequest('Invalid appeal status.');
  let query = supabase
    .from('property_report_appeals')
    .select(`
      *,
      agent:users!agent_id(id, name, email, trust_score, avatar),
      admin:users!handled_by(id, name, email),
      report:property_reports!report_id(
        id, reason, description, status, created_at, handled_at,
        property:properties!property_id(id, title, thumbnail, price, is_hidden, owner_id, owner:users!owner_id(id, name, email, trust_score)),
        reporter:users!reporter_id(id, name, email)
      )
    `)
    .order('created_at', { ascending: false });

  if (status && status !== 'ALL') {
    query = query.eq('status', status);
  }

  const { data: appeals, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const { signEvidenceUrls } = require('./evidenceStorage');
  const formattedAppeals = await Promise.all((appeals || []).map(async (a) => ({
    ...a,
    evidence_url: null,
    evidence_urls: await signEvidenceUrls(parseEvidenceUrls(a.evidence_url))
  })));

  return { appeals: formattedAppeals };
};

const approveAppeal = async (appealId, adminId, adminNote = '', customRefundPoints = null) => {
  const { positiveId, text, badRequest } = require('./businessValidation');
  appealId = positiveId(appealId, 'appealId');
  adminNote = text(adminNote, 'adminNote', 5000);
  if (customRefundPoints !== null && (!Number.isInteger(Number(customRefundPoints))
    || Number(customRefundPoints) < 0 || Number(customRefundPoints) > 100)) throw badRequest('Invalid refund points.');
  if (!appealId || !adminId) {
    const error = new Error('Thiếu thông tin appealId hoặc adminId.');
    error.statusCode = 400;
    throw error;
  }

  // 1. Fetch appeal
  const { data: appeal, error: fetchErr } = await supabase
    .from('property_report_appeals')
    .select('*')
    .eq('id', appealId)
    .single();

  if (fetchErr || !appeal) {
    const error = new Error('Không tìm thấy đơn khiếu nại.');
    error.statusCode = 404;
    throw error;
  }

  if (appeal.status !== 'PENDING') {
    const error = new Error(`Đơn khiếu nại này đã được xử lý (Trạng thái: ${appeal.status}).`);
    error.statusCode = 400;
    throw error;
  }

  // 2. Reverse report penalty & unhide property (with optional custom refund points)
  const refundResult = await trustScoreService.reverseReportPenalty(
    appeal.report_id,
    adminId,
    adminNote || 'Chấp thuận khiếu nại vi phạm',
    customRefundPoints
  );

  // 3. Update appeal status
  const handledAt = new Date().toISOString();
  const { data: updatedAppeal, error: updateErr } = await supabase
    .from('property_report_appeals')
    .update({
      status: 'APPROVED',
      handled_by: adminId,
      handled_at: handledAt,
      admin_note: adminNote?.trim() || 'Chấp thuận khiếu nại. Đã hoàn điểm và mở lại bài đăng.'
    })
    .eq('id', appealId)
    .select()
    .single();

  if (updateErr) {
    throw new Error(updateErr.message);
  }

  return {
    success: true,
    message: refundResult.message,
    appeal: { ...updatedAppeal, evidence_url: null },
    refundResult
  };
};

const rejectAppeal = async (appealId, adminId, adminNote = '') => {
  const { positiveId, text } = require('./businessValidation');
  appealId = positiveId(appealId, 'appealId');
  adminNote = text(adminNote, 'adminNote', 5000);
  if (!appealId || !adminId) {
    const error = new Error('Thiếu thông tin appealId hoặc adminId.');
    error.statusCode = 400;
    throw error;
  }

  // 1. Fetch appeal
  const { data: appeal, error: fetchErr } = await supabase
    .from('property_report_appeals')
    .select('*')
    .eq('id', appealId)
    .single();

  if (fetchErr || !appeal) {
    const error = new Error('Không tìm thấy đơn khiếu nại.');
    error.statusCode = 404;
    throw error;
  }

  if (appeal.status !== 'PENDING') {
    const error = new Error(`Đơn khiếu nại này đã được xử lý (Trạng thái: ${appeal.status}).`);
    error.statusCode = 400;
    throw error;
  }

  // 2. Update appeal status as REJECTED
  const handledAt = new Date().toISOString();
  const { data: updatedAppeal, error: updateErr } = await supabase
    .from('property_report_appeals')
    .update({
      status: 'REJECTED',
      handled_by: adminId,
      handled_at: handledAt,
      admin_note: adminNote?.trim() || 'Bác bỏ khiếu nại do bằng chứng không đủ thuyết phục.'
    })
    .eq('id', appealId)
    .select()
    .single();

  if (updateErr) {
    throw new Error(updateErr.message);
  }

  return {
    success: true,
    message: 'Đã bác bỏ khiếu nại. Giữ nguyên mức phạt và trạng thái ẩn tin.',
    appeal: { ...updatedAppeal, evidence_url: null }
  };
};

module.exports = {
  saveEvidenceImage,
  parseEvidenceUrls,
  submitAppeal,
  getAgentViolations,
  getAdminAppeals,
  approveAppeal,
  rejectAppeal
};
