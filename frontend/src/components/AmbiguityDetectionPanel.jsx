import React, { useState, useEffect, useRef } from 'react';
import apiService from '../lib/api-service';
import LoadingSpinner from './LoadingSpinner';
import AmbiguityHighlighter from './AmbiguityHighlighter';
import ClarificationPrompt from './ClarificationPrompt';

const AmbiguityDetectionPanel = ({ 
  requirement, 
  onClarificationSubmit, 
  onAnalysisComplete,
  autoAnalyze = false,
  enableRealTime = false,
  batchAnalysis = null
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(batchAnalysis);
  const [error, setError] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState(null);
  const analysisStartTimeRef = useRef(null);

  // Auto-analyze when autoAnalyze prop changes to true
  useEffect(() => {
    if (autoAnalyze && !isAnalyzing) {
      handleAnalyze();
    }
  }, [autoAnalyze]);

  // Update analysis if batchAnalysis changes
  useEffect(() => {
    if (batchAnalysis) {
      setAnalysis(batchAnalysis);
    }
  }, [batchAnalysis]);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setError(null);
    analysisStartTimeRef.current = Date.now();

    try {
      const result = await apiService.analyzeRequirement(requirement.id);
      
      // Calculate analysis time
      const analysisTime = Date.now() - analysisStartTimeRef.current;
      
      // Warn if analysis took longer than 3 seconds
      if (analysisTime > 3000) {
        console.warn(`Analysis took ${analysisTime}ms (target: <3000ms)`);
      }
      
      setAnalysis(result);
      
      if (onAnalysisComplete) {
        onAnalysisComplete(result);
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err.message || 'Failed to analyze requirement');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleTermClick = (term) => {
    setSelectedTerm(term);
  };

  const handleClarificationSubmit = async (clarifiedText, action) => {
    try {
      const result = await apiService.submitClarification(
        analysis.id,
        selectedTerm.id,
        clarifiedText,
        action
      );

      // Update analysis state
      const updatedAnalysis = { ...analysis };
      updatedAnalysis.terms_resolved = (updatedAnalysis.terms_resolved || 0) + 1;
      
      // Update term status
      const termIndex = updatedAnalysis.terms.findIndex(t => t.id === selectedTerm.id);
      if (termIndex !== -1) {
        updatedAnalysis.terms[termIndex].status = 'clarified';
      }
      
      setAnalysis(updatedAnalysis);
      setSelectedTerm(null);

      if (onClarificationSubmit) {
        onClarificationSubmit(result);
      }
    } catch (err) {
      console.error('Clarification error:', err);
      throw err;
    }
  };

  const handleSkip = () => {
    setSelectedTerm(null);
  };

  const pendingTerms = analysis?.terms?.filter(t => t.status === 'pending') || [];
  const resolvedCount = analysis?.terms_resolved || 0;
  const totalTerms = analysis?.total_terms_flagged || 0;

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-lg font-semibold text-gray-900">Improve Requirements:</h4>
          <h4 className="text-lg font-semibold text-gray-900">Ambiguous Requirements:</h4>
          {enableRealTime && (
            <span className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded-full">
              Real-time
            </span>
          )}
        </div>
        
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 flex items-center gap-2"
        >
          {isAnalyzing ? (
            <>
              <LoadingSpinner size="small" />
              <span>Analyzing...</span>
            </>
          ) : (
            'Analyze for Ambiguity'
          )}
        </button>
      </div>

      {/* Real-time analysis indicator */}
      {enableRealTime && isAnalyzing && (
        <div className="mb-3 p-2 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2">
          <LoadingSpinner size="small" />
          <span className="text-sm text-orange-700">Analyzing as you type...</span>
        </div>
      )}

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {analysis && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">{totalTerms}</span> ambiguous term{totalTerms !== 1 ? 's' : ''} detected
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">{resolvedCount}</span> resolved
                </p>
              </div>
              
              {totalTerms > 0 && (
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-orange-500 hover:text-orange-600 text-sm font-medium"
                >
                  {showDetails ? 'Hide Details' : 'Show Details'}
                </button>
              )}
            </div>

            {/* Progress bar */}
            {totalTerms > 0 && (
              <div className="mt-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(resolvedCount / totalTerms) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Inline ambiguity indicators - always shown in real-time mode */}
          {(showDetails || enableRealTime) && totalTerms > 0 && (
            <div className="space-y-3">
              <AmbiguityHighlighter
                text={analysis.original_text}
                ambiguousTerms={analysis.terms || []}
                onTermClick={handleTermClick}
              />

              {pendingTerms.length > 0 && (
                <div className="text-sm text-gray-600">
                  Click on highlighted terms to clarify them
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Clarification prompt modal */}
      {selectedTerm && (
        <ClarificationPrompt
          term={selectedTerm}
          onSubmit={handleClarificationSubmit}
          onSkip={handleSkip}
        />
      )}
    </div>
  );
};

export default AmbiguityDetectionPanel;
