import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import Tag from './Tag'; 
import AmbiguityDetectionPanel from './AmbiguityDetectionPanel';
import EdgeCasePanel from './EdgeCasePanel';

const RequirementCard = ({ 
  requirement, 
  enableRealTimeAnalysis = false,
  isConflicting = false,
  isSelected = false,   
  onEdit,
  onDelete,
  batchAnalysis
}) => {
  const { req_id, title, description, status, priority, source_document_filename, tags } = requirement;
  const [isEditing, setIsEditing] = useState(false);
  const [editedDescription, setEditedDescription] = useState(description);
  const [shouldAnalyze, setShouldAnalyze] = useState(false);
  const debounceTimerRef = useRef(null);

  // const statusColor = {
  //   'Draft': 'text-gray-500',
  //   'In Review': 'text-yellow-600',
  //   'Approved': 'text-green-600',
  //   'Implemented': 'text-indigo-600',
  // };

  useEffect(() => {
    if (!enableRealTimeAnalysis || !isEditing) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (editedDescription && editedDescription.trim() !== description) {
        setShouldAnalyze(true);
      }
    }, 1000);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [editedDescription, enableRealTimeAnalysis, isEditing, description]);

  const handleEditToggle = () => {
    setIsEditing(!isEditing);
    if (isEditing) {
      setEditedDescription(description);
    }
  };

  const handleDescriptionChange = (e) => {
    setEditedDescription(e.target.value);
  };

  const handleAnalysisComplete = () => {
    setShouldAnalyze(false);
  };

  const handleClarificationSubmit = (result) => {
    if (result.updated_requirement) {
      setEditedDescription(result.updated_requirement.description);
    }
  };

  const cardClasses = `
    bg-white rounded-xl shadow-lg p-6 transition-all duration-300 
    ${isSelected ? 'ring-4 ring-indigo-400 ring-offset-2' : ''}
    ${isConflicting 
        ? 'border-l-4 border-red-500 bg-red-50 hover:shadow-xl' 
        : 'border-l-4 border-transparent hover:shadow-md'}
  `;  

    return (
    <div className={cardClasses}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center space-x-3 min-w-0">
          {isConflicting && (
            <span 
              className="w-5 h-5 text-red-600 flex-shrink-0 animate-pulse" 
              role="img" 
              aria-label="warning"
              title="This requirement conflicts with another." 
            >
              ⚠️
            </span>
          )}
          
          <h3 className={`text-xl font-semibold leading-tight ${isConflicting ? 'text-red-700' : 'text-gray-900'} truncate`}>
            {title}
          </h3>
          <span className="text-gray-500 font-mono text-sm ml-2">{req_id}</span>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          {enableRealTimeAnalysis && (
            <button
              onClick={handleEditToggle}
              className="text-sm px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
              title={isEditing ? 'Cancel Editing' : 'Edit Description'}
            >
              {isEditing ? 'Cancel' : 'Edit'}
            </button>
          )}
          {/* --- THIS IS THE FIX --- */}
          <button 
            onClick={() => onEdit(requirement)} 
            className="text-gray-500 hover:text-indigo-600 p-1 rounded-full transition-colors"
            title="Edit Requirement"
          >
            <span role="img" aria-label="edit" style={{fontSize: '1.25rem'}}>✏️</span>
          </button>
          <button 
            onClick={() => onDelete(requirement)} 
            className="text-gray-500 hover:text-red-600 p-1 rounded-full transition-colors"
            title="Delete Requirement"
          >
            <span role="img" aria-label="delete" style={{fontSize: '1.25rem'}}>🗑️</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Tag name={status} type="status" />
        <Tag name={`${priority} Priority`} type="priority" />

        {tags && tags.map(tag => (
          <Tag key={tag.name} name={tag.name} /> 
        ))}
      </div>

      {isEditing ? (
        <textarea
          value={editedDescription}
          onChange={handleDescriptionChange}
          className="w-full p-3 border border-gray-300 rounded-lg text-gray-700 mb-4 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="Edit requirement description..."
        />
      ) : (
        <p className="text-gray-700 mb-4 whitespace-pre-line">{description}</p>
      )}

      <div className="text-sm text-gray-500 mb-4">
        <span className="font-semibold">Source:</span> {source_document_filename || 'N/A'}
      </div>

      <AmbiguityDetectionPanel
        requirement={{ ...requirement, description: editedDescription }}
        onAnalysisComplete={handleAnalysisComplete}
        onClarificationSubmit={handleClarificationSubmit}
        autoAnalyze={shouldAnalyze}
        enableRealTime={enableRealTimeAnalysis && isEditing}
        batchAnalysis={batchAnalysis}
      />

      <EdgeCasePanel
        requirement={{ ...requirement, description: editedDescription }} 
      />
    </div>
  );
};


RequirementCard.propTypes = {
  requirement: PropTypes.shape({
    id: PropTypes.number.isRequired,
    req_id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string,
    status: PropTypes.string,
    priority: PropTypes.string,
    source_document_filename: PropTypes.string,
    tags: PropTypes.arrayOf(PropTypes.object),
  }).isRequired,
  enableRealTimeAnalysis: PropTypes.bool,
  isConflicting: PropTypes.bool,
  isSelected: PropTypes.bool,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  batchAnalysis: PropTypes.object,
};

RequirementCard.defaultProps = {
    enableRealTimeAnalysis: false,
    isConflicting: false,
    isSelected: false,
    onEdit: () => console.log('Edit handler not provided'),
    onDelete: () => console.log('Delete handler not provided'),
};

export default RequirementCard;