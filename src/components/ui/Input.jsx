import { useId } from 'react';
import './Input.css';

const Input = ({ icon: Icon, rightIcon: RightIcon, label, onRightIconClick, rightIconLabel = 'Hiện hoặc ẩn mật khẩu', ...props }) => {
  const generatedId = useId();
  const inputId = props.id || generatedId;
  return (
    <div className="input-wrapper">
      {label && <label className="input-label" htmlFor={inputId}>{label}</label>}
      <div className="input-container">
        {Icon && (
          <div className="input-icon-left">
            <Icon size={20} color="var(--text-secondary)" />
          </div>
        )}
        <input 
          className={`input-field ${Icon ? 'has-left-icon' : ''} ${RightIcon ? 'has-right-icon' : ''}`}
          {...props}
          id={inputId}
        />
        {RightIcon && (
          <button type="button" className="input-icon-right" onClick={onRightIconClick} aria-label={rightIconLabel}>
            <RightIcon size={20} color="var(--text-secondary)" />
          </button>
        )}
      </div>
    </div>
  );
};

export default Input;
