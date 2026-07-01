import React from 'react';
import { motion } from 'framer-motion';
import './AuthLayout.css';

const AuthLayout = ({ children, title, subtitle, theme = 'user' }) => {
  return (
    <div className={`auth-container ${theme === 'agent' ? 'agent-theme' : ''}`}>
      <div className="auth-background">
        {/* Abstract shapes or image could go here for larger screens */}
        <div className="auth-shape shape-1"></div>
        <div className="auth-shape shape-2"></div>
      </div>
      
      <motion.div 
        className="auth-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="auth-header">
          <h1 className="brand-title">Swipe Nest</h1>
          {title && <h2 className="auth-title">{title}</h2>}
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        </div>
        
        <div className="auth-content">
          {children}
        </div>
      </motion.div>
    </div>
  );
};

export default AuthLayout;
