import { useState } from 'react';
import axios from 'axios';
import { School, Calendar, Globe, X, FileText, Settings, Edit2, ShieldCheck, Database, AlertTriangle, Key } from 'lucide-react';
import type { Institute, InstituteProfile, InstituteConfig } from './types';

const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

interface InstitutesTabProps {
  institutes: Institute[];
  fetchData: () => void;
}

export default function InstitutesTab({ institutes, fetchData }: InstitutesTabProps) {
  const [selectedProfile, setSelectedProfile] = useState<InstituteProfile | Institute | null>(null);
  
  // Config Modal State
  const [selectedInstitute, setSelectedInstitute] = useState<Institute | null>(null);
  const [configJson, setConfigJson] = useState('');
  const [configMaxStudents, setConfigMaxStudents] = useState<number | ''>('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Edit Details Modal State
  const [editDetailsModal, setEditDetailsModal] = useState<Institute | null>(null);
  const [editName, setEditName] = useState('');
  const [editTeacherName, setEditTeacherName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // Edit Plan / Revoke Modal State
  const [editPlanModal, setEditPlanModal] = useState<Institute | null>(null);
  const [selectedNewPlan, setSelectedNewPlan] = useState<'NO_PLAN' | 'BASIC' | 'PRO'>('NO_PLAN');
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  
  // Suspension State
  const [suspendModal, setSuspendModal] = useState<{ show: boolean, instituteId: string, instituteName: string } | null>(null);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [isSuspending, setIsSuspending] = useState(false);

  // Delete State
  const [deleteModal, setDeleteModal] = useState<{ show: boolean, instituteId: string, instituteName: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const getAxiosErrorMessage = (error: unknown, fallback: string) => {
    if (axios.isAxiosError(error)) {
        return error.response?.data?.error || error.message || fallback;
    }
    return error instanceof Error ? error.message : fallback;
  };

  const handleViewProfile = async (id: string) => {
      try {
          const token = localStorage.getItem('token');
          const res = await axios.get<InstituteProfile>(`${API_URL}/institute/${id}/details`, {
              headers: { Authorization: `Bearer ${token}` }
          });
          setSelectedProfile(res.data);
      } catch {
          const inst = institutes.find(i => i.id === id);
          if (inst) setSelectedProfile(inst);
      }
  };

  const handleOpenConfig = (inst: Institute) => {
      setSelectedInstitute(inst);
      const cfg = inst.config || { classes: [] };
      setConfigJson(JSON.stringify(cfg, null, 2));
      setConfigMaxStudents(cfg.maxStudents || '');
  };

  const handleSaveConfig = async () => {
      if (!selectedInstitute) return;
      setIsSavingConfig(true);
      try {
          const parsedConfig = JSON.parse(configJson) as InstituteConfig;
          if (configMaxStudents !== '') {
              parsedConfig.maxStudents = Number(configMaxStudents);
          }
          const token = localStorage.getItem('token');
          await axios.put(`${API_URL}/institutes/${selectedInstitute.id}/config`, {
              config: parsedConfig
          }, {
              headers: { Authorization: `Bearer ${token}` }
          });
          fetchData();
          setSelectedInstitute(null);
      } catch (error: unknown) {
          if (error instanceof SyntaxError) {
              alert('Invalid JSON Syntax: Please check for missing commas or braces.');
          } else {
              alert(`Save Failed: ${getAxiosErrorMessage(error, 'Unknown Error')}`);
          }
      } finally {
          setIsSavingConfig(false);
      }
  };

  const handleOpenEditDetails = (inst: Institute) => {
      setEditDetailsModal(inst);
      setEditName(inst.name || '');
      setEditTeacherName(inst.teacherName || '');
      setEditPhone(inst.phoneNumber || '');
      setEditEmail(inst.email || '');
  };

  const handleSaveDetails = async () => {
      if (!editDetailsModal) return;
      setIsSavingDetails(true);
      try {
          const token = localStorage.getItem('token');
          await axios.put(`${API_URL}/institutes/${editDetailsModal.id}/details`, {
              name: editName,
              teacherName: editTeacherName,
              phoneNumber: editPhone,
              email: editEmail
          }, {
              headers: { Authorization: `Bearer ${token}` }
          });
          fetchData();
          setEditDetailsModal(null);
      } catch {
          alert('Failed to save details');
      } finally {
          setIsSavingDetails(false);
      }
  };

  const handleOpenEditPlan = (inst: Institute) => {
      setEditPlanModal(inst);
      setSelectedNewPlan('NO_PLAN');
  };

  const handleSavePlan = async (action: 'UPDATE' | 'REVOKE') => {
      if (!editPlanModal) return;
      setIsSavingPlan(true);

      const confirmMessage = action === 'REVOKE' 
          ? `Are you sure you want to completely REVOKE the plan for ${editPlanModal.name}? This will change their plan to NO PLAN, freeze registrations, and cancel any ongoing subscriptions instantly.`
          : `Are you sure you want to change the plan of ${editPlanModal.name} to ${selectedNewPlan}?`;

      if (!window.confirm(confirmMessage)) {
          setIsSavingPlan(false);
          return;
      }

      try {
          const token = localStorage.getItem('token');
          await axios.put(`${API_URL}/institutes/${editPlanModal.id}/plan`, {
              action: action,
              plan: action === 'UPDATE' ? selectedNewPlan : 'NO_PLAN'
          }, {
              headers: { Authorization: `Bearer ${token}` }
          });
          fetchData();
          setEditPlanModal(null);
          alert(`Plan successfully ${action === 'REVOKE' ? 'revoked' : 'updated'}.`);
      } catch (error: unknown) {
          alert(getAxiosErrorMessage(error, 'Failed to update plan'));
      } finally {
          setIsSavingPlan(false);
      }
  };

  const handleSuspendInstitute = async (action: 'SUSPEND' | 'ACTIVATE', instituteId?: string) => {
      const targetId = instituteId || suspendModal?.instituteId;
      if (!targetId) return;

      if (action === 'SUSPEND' && !suspensionReason.trim()) {
          alert('Please provide a reason for suspension');
          return;
      }

      setIsSuspending(true);
      try {
          const token = localStorage.getItem('token');
          await axios.put(`${API_URL}/institutes/${targetId}/suspend`, {
              action,
              reason: suspensionReason
          }, {
              headers: { Authorization: `Bearer ${token}` }
          });
          setSuspendModal(null);
          setSuspensionReason('');
          fetchData();
      } catch (error) {
          console.error(error);
          alert('Failed to update suspension status');
      } finally {
          setIsSuspending(false);
      }
  };

  const handleDeleteInstitute = async () => {
      if (!deleteModal) return;

      setIsDeleting(true);
      try {
          const token = localStorage.getItem('token');
          await axios.delete(`${API_URL}/institutes/${deleteModal.instituteId}`, {
              headers: { Authorization: `Bearer ${token}` }
          });
          setDeleteModal(null);
          fetchData();
      } catch (error: unknown) {
          alert(getAxiosErrorMessage(error, 'Failed to delete institute'));
      } finally {
          setIsDeleting(false);
      }
  };

  const handleImpersonate = async (inst: Institute) => {
      if (!window.confirm(`Are you sure you want to securely login as the Admin of ${inst.name}?`)) return;
      try {
          const token = localStorage.getItem('token');
          const res = await axios.post(`${API_URL}/institutes/${inst.id}/impersonate`, {}, {
              headers: { Authorization: `Bearer ${token}` }
          });
          
          const data = res.data;
          // IMPORTANT: Before overwriting, store the return token so we can come back
          localStorage.setItem('superAdminReturnToken', data.superAdminReturnToken);
          
          // Now overwrite primary session
          localStorage.setItem('token', data.token);
          localStorage.setItem('refreshToken', data.refreshToken);
          localStorage.setItem('adminId', data.adminId.toString());
          
          window.location.href = '/dashboard';
      } catch (error: unknown) {
          alert(getAxiosErrorMessage(error, 'Failed to launch impersonation session. This tenant may not have an admin account yet.'));
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div>
              <h2 className="text-xl font-bold flex items-center gap-2 text-gray-900">
                  <School className="w-5 h-5 text-blue-500" />
                  Active Institutes
              </h2>
              <p className="text-sm text-gray-500 mt-1">Manage, suspend, and configure all tenant coaching centers.</p>
          </div>
          <div className="flex gap-3">
              <input 
                  type="text" 
                  placeholder="Search institutes..." 
                  className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-medium w-64 focus:outline-none focus:ring-2 focus:ring-black"
              />
          </div>
      </div>

      <div className="grid gap-4">
          {institutes.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <School className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-gray-500 font-medium">No institutes found</p>
                  <p className="text-gray-400 text-sm mt-1">Go to the Onboarding tab to generate an invite.</p>
              </div>
          ) : (
              institutes.map((inst) => (
                  <div key={inst.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow group flex items-center justify-between">
                      <div>
                          <h3 className="font-bold text-lg text-gray-900 group-hover:text-blue-600 transition-colors">
                              {inst.name}
                          </h3>
                          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                              <span className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                  {new Date(inst.createdAt).toLocaleDateString()}
                              </span>
                              {inst.status === 'SUSPENDED' ? (
                                  <span className="flex items-center gap-1.5 bg-red-50 px-2 py-1 rounded-md border border-red-200 text-red-600">
                                      <X className="w-3.5 h-3.5" />
                                      Suspended
                                  </span>
                              ) : (
                                  <span className="flex items-center gap-1.5 bg-green-50 px-2 py-1 rounded-md border border-green-200 text-green-600">
                                      <Globe className="w-3.5 h-3.5" />
                                      Active
                                  </span>
                              )}
                          </div>
                      </div>
                      <div className="flex gap-2">
                          <button onClick={() => handleViewProfile(inst.id)} className="p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl transition-all border border-gray-200" title="Details">
                              <FileText className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleOpenEditDetails(inst)} className="p-2.5 bg-purple-50/50 hover:bg-purple-50 text-purple-600 rounded-xl transition-all border border-purple-100" title="Edit Metadata">
                              <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleOpenConfig(inst)} className="p-2.5 bg-blue-50/50 hover:bg-blue-50 text-blue-600 rounded-xl transition-all border border-blue-100" title="Config Override">
                              <Settings className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleImpersonate(inst)} className="p-2.5 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-600 rounded-xl transition-all border border-emerald-100" title="Login As Admin">
                              <Key className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleOpenEditPlan(inst)} className="p-2.5 bg-orange-50/50 hover:bg-orange-50 text-orange-600 rounded-xl transition-all border border-orange-100" title="Manage Subscription">
                              <ShieldCheck className="w-4 h-4" />
                          </button>
                          {inst.status === 'SUSPENDED' ? (
                              <button onClick={() => handleSuspendInstitute('ACTIVATE', inst.id)} className="p-2.5 bg-green-50 hover:bg-green-100 text-green-600 rounded-xl transition-all border border-green-200" title="Reactivate Institute">
                                  ✓
                              </button>
                          ) : (
                              <button onClick={() => setSuspendModal({ show: true, instituteId: inst.id, instituteName: inst.name })} className="p-2.5 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-xl transition-all border border-orange-200" title="Suspend Institute">
                                  ⏸
                              </button>
                          )}
                          <button onClick={() => setDeleteModal({ show: true, instituteId: inst.id, instituteName: inst.name })} className="p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all border border-red-200" title="Delete Institute">
                              🗑
                          </button>
                      </div>
                  </div>
              ))
          )}
      </div>

      {/* --- Modals --- */}
      {/* Profile Modal */}
      {selectedProfile && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                      <div>
                          <h3 className="text-xl font-bold text-gray-900">{selectedProfile.name}</h3>
                          <p className="text-sm text-gray-500">ID: {selectedProfile.id}</p>
                      </div>
                      <button onClick={() => setSelectedProfile(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                          <X className="w-5 h-5 text-gray-500" />
                      </button>
                  </div>

                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="col-span-2">
                          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                              <Database className="w-4 h-4" /> Database Usage
                          </h4>
                          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                              <div className="flex items-end gap-2 mb-2">
                                  <span className="text-3xl font-bold text-gray-900">{(selectedProfile as InstituteProfile).stats?.dbUsageMB || '0.05'}</span>
                                  <span className="text-sm font-medium text-gray-500 mb-1.5">MB used</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                                  <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min((((selectedProfile as InstituteProfile).stats?.dbUsageMB || 0.1) / 500) * 100, 100)}%` }} />
                              </div>
                              <p className="text-xs text-gray-500">Plan Limit: 500 MB (Free Tier)</p>
                          </div>
                      </div>
                      <div className="space-y-3">
                          <div className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg">
                              <span className="text-sm text-gray-600">Total Students</span>
                              <span className="font-bold">{(selectedProfile as InstituteProfile).stats?.recordCounts?.students || selectedProfile._count?.students || 0}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg">
                              <span className="text-sm text-gray-600">Batches Created</span>
                              <span className="font-bold">{(selectedProfile as InstituteProfile).stats?.recordCounts?.batches || selectedProfile._count?.batches || 0}</span>
                          </div>
                      </div>
                      <div className="space-y-3">
                          <div className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg">
                              <span className="text-sm text-gray-600">Admin Account</span>
                              <span className="font-bold text-blue-600 truncate max-w-[150px]">{selectedProfile.admins?.[0]?.username || 'Not Set'}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg">
                              <span className="text-sm text-gray-600">Plan Status</span>
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded">ACTIVE</span>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Config Modal */}
      {selectedInstitute && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                      <h3 className="text-lg font-bold">Configuration: {selectedInstitute.name}</h3>
                      <button onClick={() => setSelectedInstitute(null)}><X className="w-5 h-5 text-gray-400" /></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1 mb-2">Max Students Allowed (Custom Override)</label>
                          <input 
                              type="number" value={configMaxStudents} onChange={(e) => setConfigMaxStudents(e.target.value === '' ? '' : Number(e.target.value))}
                              placeholder="Leave empty for plan default, or set custom limit e.g., 500"
                              className="w-full bg-gray-50 font-medium border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-black transition-all"
                          />
                      </div>
                      <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1 mb-2">Advanced Config (JSON)</label>
                          <textarea
                              value={configJson} onChange={(e) => setConfigJson(e.target.value)}
                              className="w-full h-48 font-mono text-sm bg-gray-50 border border-gray-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-black transition-all"
                          />
                      </div>
                  </div>
                  <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                      <button onClick={() => setSelectedInstitute(null)} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancel</button>
                      <button onClick={handleSaveConfig} disabled={isSavingConfig} className="px-4 py-2 bg-black text-white font-bold rounded-lg hover:bg-gray-800 disabled:opacity-50">
                          {isSavingConfig ? 'Saving...' : 'Save Configuration'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Edit Details Modal */}
      {editDetailsModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                      <div>
                          <h3 className="text-xl font-bold text-gray-900">Edit Institute Details</h3>
                      </div>
                      <button onClick={() => setEditDetailsModal(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                          <X className="w-5 h-5 text-gray-500" />
                      </button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div className="space-y-1"><label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Institute Name</label><input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black" /></div>
                      <div className="space-y-1"><label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Teacher Name</label><input type="text" value={editTeacherName} onChange={(e) => setEditTeacherName(e.target.value)} className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black" /></div>
                      <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1"><label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Phone</label><input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black" /></div>
                          <div className="space-y-1"><label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Email</label><input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black" /></div>
                      </div>
                  </div>
                  <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                      <button onClick={() => setEditDetailsModal(null)} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancel</button>
                      <button onClick={handleSaveDetails} disabled={isSavingDetails} className="px-4 py-2 bg-black text-white font-bold rounded-lg hover:bg-gray-800 disabled:opacity-50">
                          {isSavingDetails ? 'Saving...' : 'Save Changes'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Edit Plan Modal */}
      {editPlanModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden p-6 animate-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-gray-900">Manage Plan</h3>
                      <button onClick={() => setEditPlanModal(null)}><X className="w-5 h-5 text-gray-500" /></button>
                  </div>
                  <div className="space-y-6">
                      <div className="space-y-2 border border-gray-100 p-4 rounded-xl bg-gray-50/50">
                          <label className="text-sm font-bold text-gray-900">Change Plan</label>
                          <select value={selectedNewPlan} onChange={(e) => setSelectedNewPlan(e.target.value as 'NO_PLAN' | 'BASIC' | 'PRO')} className="w-full bg-white text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black font-medium text-sm">
                              <option value="NO_PLAN">NO_PLAN</option>
                              <option value="BASIC">BASIC</option>
                              <option value="PRO">PRO</option>
                          </select>
                          <button onClick={() => handleSavePlan('UPDATE')} disabled={isSavingPlan} className="w-full mt-3 px-4 py-2.5 bg-black text-white font-bold rounded-xl hover:bg-gray-800 disabled:opacity-50 text-sm">Force Update Plan</button>
                      </div>
                      <div className="space-y-2 border border-red-100 p-4 rounded-xl bg-red-50/40">
                          <h4 className="text-sm font-bold text-red-700">Danger Zone</h4>
                          <button onClick={() => handleSavePlan('REVOKE')} disabled={isSavingPlan} className="w-full px-4 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 flex justify-center gap-2 disabled:opacity-50 text-sm">
                              <AlertTriangle className="w-4 h-4" /> Revoke Plan Access
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Suspension / Delete Modals (Truncated for brevity, normally fully expanded) */}
      {suspendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
             <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
                 <h3 className="text-xl font-bold text-gray-900 mb-4">Suspend {suspendModal.instituteName}</h3>
                 <textarea value={suspensionReason} onChange={(e) => setSuspensionReason(e.target.value)} placeholder="Reason..." className="w-full border border-gray-300 rounded-xl p-3 mb-4 outline-none focus:border-orange-500" rows={3} />
                 <div className="flex gap-3">
                     <button onClick={() => setSuspendModal(null)} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl">Cancel</button>
                     <button onClick={() => handleSuspendInstitute('SUSPEND')} disabled={isSuspending} className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-xl disabled:opacity-50">{isSuspending ? 'Suspending...' : 'Suspend'}</button>
                 </div>
             </div>
        </div>
      )}
      {deleteModal && (
         <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 border-2 border-red-200">
                <h3 className="text-xl font-bold text-red-600 mb-4">Delete Permanently</h3>
                <p className="text-sm text-gray-700 mb-4">You are about to delete {deleteModal.instituteName}. This cannot be undone.</p>
                <div className="flex gap-3">
                    <button onClick={() => setDeleteModal(null)} className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl">Cancel</button>
                    <button onClick={handleDeleteInstitute} disabled={isDeleting} className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-xl disabled:opacity-50">Delete</button>
                </div>
            </div>
         </div>
      )}
    </div>
  );
}
