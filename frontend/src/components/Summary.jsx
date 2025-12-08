import React, { useState, useEffect } from 'react';
import apiService from '../lib/api-service.js';


const StructuredSummary = ({ summaryData }) => {
  if (!summaryData) {
    return null;
  }

  const { summary, key_decisions, open_questions, action_items } = summaryData;

  return (
    <div className="space-y-4">
      <p className="text-gray-700 whitespace-pre-wrap font-sans">
        {summary}
      </p>

      {key_decisions && key_decisions.length > 0 && (
        <div>
          <h4 className="text-lg font-semibold text-gray-800 mb-2">Key Decisions</h4>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            {key_decisions.map((item, index) => (
              <li key={`dec-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {open_questions && open_questions.length > 0 && (
        <div>
          <h4 className="text-lg font-semibold text-gray-800 mb-2">Open Questions</h4>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            {open_questions.map((item, index) => (
              <li key={`q-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {action_items && action_items.length > 0 && (
        <div>
          <h4 className="text-lg font-semibold text-gray-800 mb-2">Action Items</h4>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            {action_items.map((item, index) => (
              <li key={`act-${index}`}>
                {item.assignee || 'Unassigned'} — {item.task}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};


const AutomatedSummary = ({ refreshSignal }) => {
  const [summary, setSummary] = useState(null); 
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    
    const fetchSummary = async () => {
      if (!isMounted) return;
      
      try {
        setIsLoading(true);
        const response = await apiService.coreApi('/api/summary');
        if (!isMounted) return;
        setSummary(response.summary ? JSON.parse(response.summary) : null);
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        console.error("Error fetching summary:", err);
        if (err.message.includes('Authentication failed')) {
          setError("Authentication required. Please log in again.");
        } else {
          setError("No summary found. Upload a document to auto-generate one, or click 'Regenerate'.");
        }
        setSummary(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchSummary();
    
    return () => {
      isMounted = false;
    };
  }, [refreshSignal]); 

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    setError(null);
    try {
      const response = await apiService.coreApi('/api/summary/generate', {
        method: 'POST'
      });
      setSummary(response.summary ? JSON.parse(response.summary) : null);
    } catch (err) {
      console.error("Error regenerating summary:", err);
      setError("Failed to regenerate summary. Please try again later.");
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-400">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-gray-900">Automated Project Summary</h3>
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating || isLoading}
          className="flex items-center px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-100 rounded-md hover:bg-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-wait"
        >
          {isRegenerating ? (
            <span className="animate-spin -ml-1 mr-2 h-5 w-5 inline-block text-lg">🔄</span>
          ) : (
            <span className="-ml-1 mr-2 h-5 w-5 inline-block text-lg">🔄</span>
          )}
          {isRegenerating ? 'Regenerating...' : 'Regenerate'}
        </button>
      </div>
      
      {isLoading && <p className="text-gray-600">Loading summary...</p>}
      {error && !isRegenerating && <p className="text-red-600">{error}</p>}
      
      {summary && !isLoading && (
        <StructuredSummary summaryData={summary} />
      )}
      
      {!summary && !isLoading && !error && (
          <p className="text-gray-500">No summary available. Upload documents to generate one.</p>
      )}
    </div>
  );
};

export default AutomatedSummary;
export { StructuredSummary };