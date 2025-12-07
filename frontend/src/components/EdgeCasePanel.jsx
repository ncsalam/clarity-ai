// EdgeCasePanel.jsx
// Updated to call the real backend API instead of returning "test"

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import apiService from '../lib/api-service';            // NEW: import real API
import LoadingSpinner from './LoadingSpinner';      // OPTIONAL: matches ambiguity panel styling

const EdgeCasePanel = ({ requirement }) => {
  const [edgeCases, setEdgeCases] = useState(null); // UPDATED: holds list of edge cases
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);         // NEW: track API errors
  const [showDetails, setShowDetails] = useState(true); // NEW: toggle like ambiguity panel

  const handleGenerateEdgeCases = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 🔥 REAL API CALL
      const result = await apiService.generateEdgeCases(requirement.id);

      // result = { requirement_id: ..., edge_cases: [...] }
      setEdgeCases(result.edge_cases || []);
      setShowDetails(true);
    } catch (err) {
      console.error("Edge case generation error:", err);
      setError(err.message || "Failed to generate edge cases");
    } finally {
      setIsLoading(false);
    }
  };

  const hasEdgeCases = edgeCases && edgeCases.length > 0;

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      {/* Header row with title + button */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-lg font-semibold text-gray-900">
            Edge Cases:
          </h4>
        </div>

        <button
          onClick={handleGenerateEdgeCases}
          disabled={isLoading}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <LoadingSpinner size="small" /> {/* OPTIONAL visual match */}
              <span>Generating...</span>
            </>
          ) : (
            "Generate Edge Cases"
          )}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Edge case output */}
      {hasEdgeCases && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-2">
          {/* Summary header */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">{edgeCases.length}</span>{" "}
              edge case{edgeCases.length !== 1 ? "s" : ""} generated
            </p>

            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-indigo-500 hover:text-indigo-600 text-sm font-medium"
            >
              {showDetails ? "Hide Details" : "Show Details"}
            </button>
          </div>

          {/* Details list */}
          {showDetails && (
            <ul className="mt-3 list-disc list-inside text-sm text-gray-700 space-y-1">
              {edgeCases.map((ec, idx) => (
                <li key={idx}>{ec}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

EdgeCasePanel.propTypes = {
  requirement: PropTypes.object.isRequired,
};

export default EdgeCasePanel;
