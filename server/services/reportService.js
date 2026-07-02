const { supabase } = require('../config/supabase');
const trustScoreService = require('./trustScoreService');

const VALID_REPORT_REASONS = new Set([
  'WRONG_PRICE',
  'WRONG_IMAGE',
  'WRONG_LOCATION',
  'SCAM',
  'DUPLICATE',
  'ALREADY_RENTED',
  'OTHER'
]);

const createServiceError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const validateReportReason = (reason) => {
  if (!VALID_REPORT_REASONS.has(reason)) {
    throw createServiceError('Invalid report reason');
  }
};

const getPropertyForReport = async (propertyId) => {
  const { data: property, error } = await supabase
    .from('properties')
    .select('id, title, owner_id')
    .eq('id', propertyId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw createServiceError('Property not found', 404);
    }

    throw new Error(error.message);
  }

  if (!property) {
    throw createServiceError('Property not found', 404);
  }

  return property;
};

const createReport = async ({ propertyId, reporterId, reason, description }) => {
  if (!propertyId || !reporterId || !reason) {
    throw createServiceError('Missing propertyId, reporterId or reason');
  }

  validateReportReason(reason);

  const property = await getPropertyForReport(propertyId);
  if (String(property.owner_id) === String(reporterId)) {
    throw createServiceError('You cannot report your own property');
  }

  const { data: report, error } = await supabase
    .from('property_reports')
    .insert({
      property_id: propertyId,
      reporter_id: reporterId,
      reason,
      description: description || null,
      status: 'PENDING'
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    success: true,
    message: 'Report submitted successfully',
    report
  };
};

const attachPropertiesToReports = async (reports) => {
  const propertyIds = [...new Set((reports || []).map((report) => report.property_id).filter(Boolean))];
  if (propertyIds.length === 0) {
    return reports || [];
  }

  const { data: properties, error } = await supabase
    .from('properties')
    .select('id, title, owner_id')
    .in('id', propertyIds);

  if (error) {
    throw new Error(error.message);
  }

  const propertyMap = new Map((properties || []).map((property) => [property.id, property]));
  return reports.map((report) => ({
    ...report,
    property: propertyMap.get(report.property_id) || null
  }));
};

const getAdminReports = async (status) => {
  let query = supabase
    .from('property_reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data: reports, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return {
    success: true,
    reports: await attachPropertiesToReports(reports || [])
  };
};

const resolveReport = async (reportId, adminId) => {
  if (!reportId || !adminId) {
    throw createServiceError('Missing reportId or adminId');
  }

  const result = await trustScoreService.applyReportPenalty(reportId, adminId);
  return {
    success: true,
    message: result.message,
    result
  };
};

const rejectReport = async (reportId, adminId) => {
  if (!reportId || !adminId) {
    throw createServiceError('Missing reportId or adminId');
  }

  const handledAt = new Date().toISOString();
  const { data: report, error } = await supabase
    .from('property_reports')
    .update({
      status: 'REJECTED',
      handled_by: adminId,
      handled_at: handledAt
    })
    .eq('id', reportId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw createServiceError('Report not found', 404);
    }

    throw new Error(error.message);
  }

  return {
    success: true,
    message: 'Report rejected successfully',
    report
  };
};

module.exports = {
  createReport,
  getAdminReports,
  resolveReport,
  rejectReport
};
