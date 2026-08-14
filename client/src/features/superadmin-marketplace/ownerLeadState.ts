export const ownerLeadStatuses = ['NEW', 'CONTACTED', 'ENROLLED', 'CLOSED'] as const;
export type OwnerLeadStatus = typeof ownerLeadStatuses[number];
export const ownerLeadStatusLabel = (status: OwnerLeadStatus) => status.charAt(0) + status.slice(1).toLowerCase();
