import React from 'react';
import './Button.css';

const Button = ({ children, variant = 'primary', fullWidth, icon: Icon, className = '', ...props }) => {
  const classes = `btn btn-${variant} ${fullWidth ? 'btn-full' : ''} ${className}`;
  
  return (
    <button className={classes} {...props}>
      {Icon && <Icon size={20} className="btn-icon" />}
      {children}
    </button>
  );
};

export default Button;
