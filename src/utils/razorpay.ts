import crypto from 'crypto';

/**
 * Plan duration types
 */
type PlanDuration = 'QUARTERLY' | 'YEARLY';







export const calculateEndDate = (startDate: Date, duration: string): Date => {
  const endDate = new Date(startDate);
  const durationUpper = duration.toUpperCase();
  
  if (durationUpper === 'QUARTERLY') {
    endDate.setDate(endDate.getDate() + 90); // 90 days
  } else if (durationUpper === 'YEARLY') {
    endDate.setDate(endDate.getDate() + 365); // 365 days
  } else {
    throw new Error('Invalid plan duration. Must be QUARTERLY or YEARLY');
  }
  
  return endDate;
};

/**
 * Validate plan duration
 */
export const isValidDuration = (duration: string): boolean => {
  const durationUpper = duration.toUpperCase();
  return durationUpper === 'QUARTERLY' || durationUpper === 'YEARLY';
};