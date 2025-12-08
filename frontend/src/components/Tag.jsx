import React from 'react';
import { getTagColor } from '../util/tagColors';

const Tag = ({ name, type = 'default' }) => {
  let bgColor = getTagColor(name);

  // Special handling for status type (overrides)
  if (type === 'status') {
    bgColor = name === 'Draft' ? '#d1d5db' : '#fed7aa';
  }

  const isDarkText = ['#facc15', '#86efac'].includes(bgColor); // optional tweak

  return (
    <span
      className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: bgColor,
        color: isDarkText ? '#000' : '#fff'
      }}
    >
      {name}
    </span>
  );
};

export default Tag;
