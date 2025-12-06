import React, { useState } from "react";
import PropTypes from "prop-types";
import apiService from "../lib/api-service";
import LoadingSpinner from "./LoadingSpinner";

const EdgeCasePanel = ({ requirement }) => {
  // edgeCases is an array of objects: { id, text, checked }
  const [edgeCases, setEdgeCases] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showDetails, setShowDetails] = useState(true);

  // Inline editing state
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  // Copy status
  const [copyStatus, setCopyStatus] = useState(""); // NEW

  const hasEdgeCases = Array.isArray(edgeCases) && edgeCases.length > 0;

  // Helper: convert raw strings → {id, text, checked}
  const mapRawCases = (rawCases) =>
    rawCases
      .filter((c) => typeof c === "string" && c.trim().length > 0)
      .map((text, idx) => ({
        id: `${requirement.id}-${Date.now()}-${idx}`,
        text: text.trim(),
        checked: false
      }));

  // REGENERATE = replace entire list
  const handleRegenerateEdgeCases = async () => {
    setIsLoading(true);
    setError(null);
    setCopyStatus("");

    try {
      const result = await apiService.generateEdgeCases(requirement.id);
      const rawCases = result.edge_cases || [];
      const mappedCases = mapRawCases(rawCases);

      setEdgeCases(mappedCases);
      setShowDetails(true);
      setEditingId(null);
      setEditingValue("");
    } catch (err) {
      console.error("Edge case generation error:", err);
      setError(err.message || "Failed to generate edge cases");
    } finally {
      setIsLoading(false);
    }
  };

  // GENERATE MORE = append new non-duplicate cases
  const handleGenerateMoreEdgeCases = async () => {
    setIsLoading(true);
    setError(null);
    setCopyStatus("");

    try {
      const result = await apiService.generateEdgeCases(requirement.id);
      const rawCases = result.edge_cases || [];
      const mappedCases = mapRawCases(rawCases);

      setEdgeCases((prev) => {
        const existing = prev || [];
        const existingTexts = new Set(existing.map((ec) => ec.text));
        const newOnes = mappedCases.filter((ec) => !existingTexts.has(ec.text));
        return [...existing, ...newOnes];
      });

      setShowDetails(true);
    } catch (err) {
      console.error("Edge case generation error:", err);
      setError(err.message || "Failed to generate edge cases");
    } finally {
      setIsLoading(false);
    }
  };

  // Checkbox toggle
  const handleToggleChecked = (id) => {
    setEdgeCases((prev) =>
      prev.map((ec) =>
        ec.id === id ? { ...ec, checked: !ec.checked } : ec
      )
    );
  };

  // Delete case locally
  const handleDeleteEdgeCase = (id) => {
    setEdgeCases((prev) => prev.filter((ec) => ec.id !== id));

    if (editingId === id) {
      setEditingId(null);
      setEditingValue("");
    }
    setCopyStatus("");
  };

  // Inline editing
  const startEditing = (edgeCase) => {
    setEditingId(edgeCase.id);
    setEditingValue(edgeCase.text);
    setCopyStatus("");
  };

  const handleEditChange = (e) => {
    setEditingValue(e.target.value);
  };

  const saveEdit = (id) => {
    const trimmed = editingValue.trim();
    if (!trimmed) {
      // Cancel empty edit
      setEditingId(null);
      setEditingValue("");
      return;
    }

    setEdgeCases((prev) =>
      prev.map((ec) =>
        ec.id === id ? { ...ec, text: trimmed } : ec
      )
    );

    setEditingId(null);
    setEditingValue("");
    setCopyStatus("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingValue("");
  };

  const handleEditKeyDown = (e, id) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit(id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  // NEW: Copy all current (non-deleted) edge cases
  const handleCopyAll = async () => {
    if (!hasEdgeCases) return;

    try {
      const header = requirement?.title
        ? `Edge Cases for: ${requirement.title}\n`
        : "Edge Cases:\n";

      const body = edgeCases
        .map((ec) => `- ${ec.text}`)
        .join("\n");

      await navigator.clipboard.writeText(`${header}${body}`);
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus(""), 2000);
    } catch (err) {
      console.error("Failed to copy edge cases:", err);
      setCopyStatus("Copy failed");
      setTimeout(() => setCopyStatus(""), 3000);
    }
  };

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      {/* Header row with title + buttons */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-lg font-semibold text-gray-900">
          Edge Case Analysis
        </h4>

        <div className="flex items-center gap-2">
          {/* Regenerate */}
          <button
            onClick={handleRegenerateEdgeCases}
            disabled={isLoading}
            className="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 flex items-center gap-2 text-sm"
          >
            {isLoading ? (
              <>
                <LoadingSpinner size="small" />
                <span>Generating...</span>
              </>
            ) : (
              "Regenerate"
            )}
          </button>

          {/* Generate More */}
          <button
            onClick={handleGenerateMoreEdgeCases}
            disabled={isLoading || !hasEdgeCases}
            className="px-3 py-2 bg-white text-orange-600 border border-orange-300 rounded-lg hover:bg-orange-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed transition-colors duration-200 text-sm"
          >
            Generate More
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Edge case list */}
      {hasEdgeCases && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-2">
          {/* Summary + Copy All */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-600">
                <span className="font-semibold">{edgeCases.length}</span>{" "}
                edge case{edgeCases.length !== 1 ? "s" : ""} generated
              </p>

              {/* Copy status text */}
              {copyStatus && (
                <span className="text-xs text-gray-500">
                  {copyStatus}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleCopyAll}
                disabled={!hasEdgeCases}
                className="text-xs text-gray-600 hover:text-gray-800 underline disabled:text-gray-300 disabled:no-underline"
              >
                Copy All
              </button>

              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-indigo-500 hover:text-indigo-600 text-sm font-medium"
              >
                {showDetails ? "Hide Details" : "Show Details"}
              </button>
            </div>
          </div>

          {/* Details */}
          {showDetails && (
            <ul className="mt-3 space-y-2">
              {edgeCases.map((ec) => (
                <li
                  key={ec.id}
                  className="flex items-start gap-2 text-sm text-gray-700"
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                    checked={ec.checked}
                    onChange={() => handleToggleChecked(ec.id)}
                  />

                  {/* Text or text editor */}
                  <div className="flex-1">
                    {editingId === ec.id ? (
                      <textarea
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        value={editingValue}
                        onChange={handleEditChange}
                        onBlur={() => saveEdit(ec.id)}
                        onKeyDown={(e) => handleEditKeyDown(e, ec.id)}
                        rows={2}
                      />
                    ) : (
                      <span
                        className={
                          ec.checked
                            ? "line-through text-gray-400 cursor-pointer"
                            : "text-gray-700 cursor-pointer"
                        }
                        onDoubleClick={() => startEditing(ec)}
                      >
                        {ec.text}
                      </span>
                    )}
                  </div>

                  {/* Buttons: Edit + Delete in one row */}
                  <div className="flex flex-row items-center gap-3 ml-2">
                    {editingId !== ec.id && (
                      <button
                        type="button"
                        onClick={() => startEditing(ec)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Edit
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteEdgeCase(ec.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

EdgeCasePanel.propTypes = {
  requirement: PropTypes.object.isRequired
};

export default EdgeCasePanel;
