import React from 'react';
import './Input.css';

const Input = ({ icon: Icon, rightIcon: RightIcon, label, onRightIconClick, ...props }) => {
  return (
    <div className="input-wrapper">
      {label && <label className="input-label">{label}</label>}
      <div className="input-container">
        {Icon && (
          <div className="input-icon-left">
            <Icon size={20} color="var(--text-secondary)" />
          </div>
        )}
        <input 
          className={`input-field ${Icon ? 'has-left-icon' : ''} ${RightIcon ? 'has-right-icon' : ''}`}
          {...props}
        />
        {RightIcon && (
          <button type="button" className="input-icon-right" onClick={onRightIconClick}>
            <RightIcon size={20} color="var(--text-secondary)" />
          </button>
        )}
      </div>
    </div>
  );
};

export default Input;
