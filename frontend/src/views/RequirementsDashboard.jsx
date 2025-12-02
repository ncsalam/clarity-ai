import React, { useState, useEffect, useRef } from 'react';
import apiService from '../lib/api-service.js'; 
import RequirementCard from '../components/RequirementCard.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ContradictionPanel from '../components/ContradictionPanel.jsx';
import Notification from '../components/Notification.jsx'; 
// --- 1. IMPORT YOUR MODALS ---
import EditRequirementModal from '../components/EditRequirementModal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

const RequirementsDashboard = ({ refreshSignal, onTriggerRefresh }) => {
  const [requirements, setRequirements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [enableRealTimeAnalysis, setEnableRealTimeAnalysis] = useState(false);
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchResults, setBatchResults] = useState(null);
  const [showBatchResults, setShowBatchResults] = useState(false);
  const batchCancelRef = useRef(false);

  const [contradictionReport, setContradictionReport] = useState(null);
  const [isContradictionLoading, setIsContradictionLoading] = useState(false);
  const [conflictingReqIds, setConflictingReqIds] = useState([]); 

  const [successMessage, setSuccessMessage] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // --- 2. ADD STATE FOR MODALS ---
  const [reqToEdit, setReqToEdit] = useState(null);
  const [reqToDelete, setReqToDelete] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRequirements = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.coreApi('/api/requirements'); 
      setRequirements(response);
      // Reset batch analysis UI after data reload
      setShowBatchResults(false);
      setBatchResults(null);
      setBatchProgress({ current: 0, total: 0 });
      setError(null);
    } catch (err) {
      console.error("Error fetching requirements:", err);
      if (err.message.includes('Authentication failed') || err.message.includes('Session expired')) {
        setError("Authentication required. Please log in again.");
      } else {
        setError("Failed to load requirements. Is the backend server running?");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      if (!isMounted) return;
      await fetchRequirements();
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, [refreshSignal]);

  const handleRegenerate = async () => {
    if (!window.confirm('This will re-analyze all documents and generate new requirements. This may take a moment. Continue?')) {
        return;
    }
    try {
        setIsGenerating(true);
        setError(null);
      // Reset batch analysis UI to defaults
      setShowBatchResults(false);
      setBatchResults(null);
      setBatchProgress({ current: 0, total: 0 });
      // Revert sidebar contents to startup state (do not change open/close)
      setContradictionReport(null);
      setConflictingReqIds([]);
        await apiService.coreApi('/api/requirements/generate', { method: 'POST' });
        if (onTriggerRefresh) {
            onTriggerRefresh(); 
        } else {
            fetchRequirements();
        }
    } catch (err) {
        console.error("Error generating requirements:", err);
        setError("Failed to generate new requirements.");
    } finally {
        setIsGenerating(false);
    }
  };

  const handleBatchAnalyze = async () => {
    if (requirements.length === 0) {
      setError("No requirements to analyze");
      return;
    }
    if (!window.confirm(`This will analyze all ${requirements.length} requirements for ambiguity. Continue?`)) {
      return;
    }
    
    setIsSidebarOpen(true); 
    
    setIsBatchAnalyzing(true);
    setBatchProgress({ current: 0, total: requirements.length });
    setBatchResults(null);
    setShowBatchResults(false);
    setError(null);
    batchCancelRef.current = false;

    try {
      const requirementIds = requirements.map(req => req.id);
      const results = [];
      let totalTerms = 0;
      let totalResolved = 0;
      const batchSize = 5; 

      for (let i = 0; i < requirementIds.length; i += batchSize) {
        if (batchCancelRef.current) {
          setError("Batch analysis cancelled");
          break;
        }
        const batch = requirementIds.slice(i, i + batchSize);
        try {
          const batchAnalysisResults = await apiService.batchAnalyzeRequirements(batch);
          const analyses = batchAnalysisResults.analyses;
          results.push(...analyses);
          setBatchProgress({ current: Math.min(i + batchSize, requirementIds.length), total: requirementIds.length });
          analyses.forEach(result => {
            totalTerms += result.total_terms_flagged || 0;
            totalResolved += result.terms_resolved || 0;
          });
        } catch (err) {
          console.error(`Error analyzing batch ${i / batchSize + 1}:`, err);
        }
      }

      if (!batchCancelRef.current) {
        setBatchResults({
          totalRequirements: requirements.length,
          analyzedRequirements: results.length,
          totalTerms,
          totalResolved,
          results
        });
        setShowBatchResults(true);
      }
    } catch (err) {
      console.error("Batch analysis error:", err);
      setError(err.message || "Failed to complete batch analysis");
    } finally {
      setIsBatchAnalyzing(false);
    }
  };

  const handleCancelBatchAnalysis = () => {
    batchCancelRef.current = true;
  };

  const handleRunProjectContradictionAnalysis = async () => {
      if (!window.confirm(`This will analyze all documents in the project for contradictions. This may take a moment. Continue?`)) {
          return;
      }

      setIsSidebarOpen(true); 
      
      setIsContradictionLoading(true);
      setError(null);
      setSuccessMessage(null);
      
      try {
          const report = await apiService.runProjectContradictionAnalysis(); 
          setContradictionReport(report);
          
          if (report && report.conflicts && report.conflicts.length > 0) {
              const allConflictingIds = report.conflicts.flatMap(c => c.conflicting_requirement_ids);
              setConflictingReqIds(Array.from(new Set(allConflictingIds)));
              setError('Contradiction analysis complete. Conflicts found!');
          } else {
              setConflictingReqIds([]);
              setSuccessMessage('Analysis complete. No contradictions found.');
          }
      } catch (err) {
          const errorMsg = err.message || 'Failed to run project-wide contradiction analysis.';
          setError(errorMsg);
      } finally {
          setIsContradictionLoading(false);
      }
  };

  const handleConflictSelect = (ids) => {
    console.log("Conflict selected:", ids);
    setConflictingReqIds(ids); 
  };
  
  // --- 3. REPLACE OLD HANDLERS WITH THESE ---
  const handleEditClick = (requirement) => {
      setError(null);
      setSuccessMessage(null);
      setReqToEdit(requirement);
  };
  
  const handleDeleteClick = (requirement) => {
      setError(null);
      setSuccessMessage(null);
      setReqToDelete(requirement);
  };

  const handleConfirmDelete = async () => {
    if (!reqToDelete) return;

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await apiService.deleteRequirement(reqToDelete.id);
      setSuccessMessage(`Requirement ${reqToDelete.req_id} deleted successfully.`);
      setReqToDelete(null);
      fetchRequirements(); 
    } catch (err) {
      setError(err.message || "Failed to delete requirement.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRequirement = async (updatedData) => {
    if (!reqToEdit) return;

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await apiService.updateRequirement(reqToEdit.id, updatedData);
      setSuccessMessage(`Requirement ${reqToEdit.req_id} updated successfully.`);
      setReqToEdit(null);
      fetchRequirements(); 
    } catch (err) {
      setError(err.message || "Failed to update requirement.");
    } finally {
      setIsSubmitting(false);
    }
  };
  // --- END OF NEW HANDLERS ---


  if (isLoading && requirements.length === 0) {
    return <LoadingSpinner message="Loading all project requirements..." />;
  }

  return (
    <div className="flex h-full overflow-hidden">
        
        <div className={`overflow-y-auto p-6 space-y-6 ${isSidebarOpen ? 'flex-1' : 'w-full'}`}>
            
            <div className="sticky top-0 z-20">
              <Notification
                type="success"
                message={successMessage}
                isVisible={!!successMessage}
                onClose={() => setSuccessMessage(null)}
                autoClose={true}
                duration={4000}
              />
              <Notification
                type="error"
                message={error}
                isVisible={!!error}
                onClose={() => setError(null)}
                autoClose={false}
              />
            </div>
            
            <div className="flex justify-between items-center border-b pb-4 sticky top-0 bg-white z-10">
                <h1 className="text-3xl font-extrabold text-gray-900">
                    Project Requirements
                </h1>
                <div className="flex items-center space-x-3">
                     
                     <button
                         onClick={handleRunProjectContradictionAnalysis}
                         disabled={isContradictionLoading || isBatchAnalyzing || isLoading || isGenerating} 
                         className="flex items-center px-4 py-2 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                         title="Run contradiction analysis on ALL documents"
                     >
                         <span className="mr-2">⚠️</span>
                         {isContradictionLoading ? 'Analyzing...' : 'Analyze Contradictions'}
                     </button>

                    <button
                        onClick={handleBatchAnalyze}
                        disabled={isBatchAnalyzing || isLoading || requirements.length === 0 || isGenerating || isContradictionLoading}
                        className="flex items-center px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700 transition duration-150 ease-in-out disabled:opacity-50"
                        title="Analyze all requirements for ambiguity"
                    >
                        {isBatchAnalyzing ? 'Analyzing...' : '🔍 Analyze Ambiguity'}
                    </button>
                    
                    <button 
                        onClick={handleRegenerate} 
                        disabled={isGenerating || isLoading || isBatchAnalyzing || isContradictionLoading}
                        className="flex items-center px-4 py-2 bg-orange-500 text-white font-semibold rounded-lg shadow-md hover:bg-orange-600 transition duration-150 ease-in-out disabled:opacity-50"
                    >
                        <span className="mr-2">🔄</span>
                        {isGenerating ? 'Generating...' : 'Regenerate All'}
                    </button>
                    
                    <span 
                      className="text-2xl text-gray-500 hover:text-gray-700 cursor-pointer" 
                      title="Settings"
                      onClick={() => setIsSidebarOpen(true)}
                    >
                      ⚙️
                    </span>
                </div>
            </div>

            {isBatchAnalyzing && (
              <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                    <span className="text-purple-900 font-semibold">
                      Analyzing for ambiguity... {batchProgress.current} / {batchProgress.total}
                    </span>
                  </div>
                  <button
                    onClick={handleCancelBatchAnalysis}
                    className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <div className="w-full bg-purple-200 rounded-full h-3">
                  <div
                    className="bg-purple-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {showBatchResults && batchResults && (
              <div className="mb-6 p-6 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-green-900">Ambiguity Analysis Complete</h3>
                  <button
                    onClick={() => setShowBatchResults(false)}
                    className="text-green-700 hover:text-green-900 text-2xl"
                  >
                    &times;
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-lg shadow">
                    <p className="text-sm text-gray-600 mb-1">Requirements Analyzed</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {batchResults.analyzedRequirements} / {batchResults.totalRequirements}
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <p className="text-sm text-gray-600 mb-1">Total Ambiguous Terms</p>
                    <p className="text-2xl font-bold text-orange-600">{batchResults.totalTerms}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <p className="text-sm text-gray-600 mb-1">Terms Resolved</p>
                    <p className="text-2xl font-bold text-green-600">{batchResults.totalResolved}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow">
                    <p className="text-sm text-gray-600 mb-1">Pending Clarifications</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {batchResults.totalTerms - batchResults.totalResolved}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {requirements.length === 0 ? (
                <div className="text-center p-10 border rounded-xl bg-gray-50">
                    <p className="text-lg text-gray-600">No requirements found for this project.</p>
                    <p className="text-sm text-gray-400 mt-2">Upload documents and generate requirements to begin.</p>
                </div>
            ) : (
                <div className="space-y-4">
                  {requirements.map(req => {
                    // Find batch analysis result for this requirement
                    let batchAnalysis = null;
                    if (showBatchResults && batchResults && batchResults.results) {
                      batchAnalysis = batchResults.results.find(r => r.requirement_id === req.id);
                    }
                    return (
                      <div key={req.id} id={`req-card-${req.req_id}`}>
                        <RequirementCard
                          requirement={req}
                          enableRealTimeAnalysis={enableRealTimeAnalysis}
                          isConflicting={contradictionReport?.conflicts?.some(c => c.conflicting_requirement_ids.includes(req.req_id)) || false}
                          isSelected={conflictingReqIds.includes(req.req_id)}
                          // --- Pass batch ambiguity results ---
                          batchAnalysis={batchAnalysis}
                          onEdit={handleEditClick}
                          onDelete={handleDeleteClick}
                        />
                      </div>
                    );
                  })}
                </div>
            )}
        </div>
        
        {isSidebarOpen && (
          <div className="w-96 border-l border-gray-200 bg-gray-50 p-6 overflow-y-auto flex-shrink-0">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">Analysis Results</h2>
                <button 
                  onClick={() => setIsSidebarOpen(false)} 
                  className="text-gray-500 hover:text-gray-800" 
                  title="Close Sidebar"
                >
                  <span className="text-2xl font-bold">&times;</span>
                </button>
              </div>
              
              <div className="mb-6">
                  <h3 className="font-bold text-lg text-red-700 mb-3 flex items-center">
                      <span className="mr-2">⚠️</span> Contradictions
                  </h3>
                  <ContradictionPanel 
                      report={contradictionReport} 
                      onConflictSelect={handleConflictSelect} 
                      currentConflictingIds={conflictingReqIds}
                      isLoading={isContradictionLoading}
                  />
              </div>

              <div className="mb-6 pt-4 border-t border-gray-300">
                  <h3 className="font-bold text-lg text-indigo-700 mb-3">
                      Ambiguity Detection
                  </h3>
                  
                  <div className="mb-4">
                      <button
                          onClick={() => setEnableRealTimeAnalysis(!enableRealTimeAnalysis)}
                          className={`w-full px-4 py-2 rounded-lg font-semibold transition-colors ${
                              enableRealTimeAnalysis
                              ? 'bg-orange-500 text-white hover:bg-orange-600'
                              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                          }`}
                          title="Toggle real-time ambiguity analysis in the requirement cards"
                      >
                          {enableRealTimeAnalysis ? '⚡ Real-time ON' : '⚡ Real-time OFF'}
                      </button>
                  </div>

                  <div className="p-4 bg-white rounded-lg border text-sm text-gray-500">
                      Run "Analyze Ambiguity" to see a project-wide report.
                      <br /><br />
                      Toggle "Real-time" to check for ambiguity as you edit.
                  </div>
              </div>
          </div>
        )}

        {/* --- 5. RENDER THE MODALS --- */}
        {reqToDelete && (
          <ConfirmDialog
            isOpen={!!reqToDelete}
            title="Confirm Deletion"
            message={`Are you sure you want to delete requirement ${reqToDelete.req_id}: "${reqToDelete.title}"? This action cannot be undone.`}
            confirmText="Delete"
            cancelText="Cancel"
            onConfirm={handleConfirmDelete}
            onCancel={() => setReqToDelete(null)}
            loading={isSubmitting}
            type="danger" 
          />
        )}

        {reqToEdit && (
          <EditRequirementModal
            requirement={reqToEdit}
            onClose={() => setReqToEdit(null)}
            onSave={handleUpdateRequirement}
            isLoading={isSubmitting}
          />
        )}
    </div>
  );
};

export default RequirementsDashboard;