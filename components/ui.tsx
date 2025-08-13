
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
}

export const Input: React.FC<InputProps> = ({ label, description, ...props }) => (
  <div className="w-full">
    <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
    <input
      {...props}
      className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 transition"
    />
    {description && <p className="mt-2 text-sm text-slate-400">{description}</p>}
  </div>
);

interface SelectProps {
  label?: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; icon?: string; subtitle?: string }[];
  className?: string;
  disabled?: boolean;
}

export const Select: React.FC<SelectProps> = ({ 
  label, 
  description, 
  value, 
  onChange, 
  options, 
  className = '', 
  disabled = false 
}) => {
  return (
    <div className={`w-full ${className}`}>
      {label && <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.icon && `${option.icon} `}{option.label}
            {option.subtitle && ` - ${option.subtitle}`}
          </option>
        ))}
      </select>
      {description && <p className="mt-2 text-sm text-slate-400">{description}</p>}
    </div>
  );
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

export const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', ...props }) => {
  const baseClasses = "font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";
  const variantClasses = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-200',
  };
  return (
    <button className={`${baseClasses} ${variantClasses[variant]}`} {...props}>
      {children}
    </button>
  );
};

interface ToggleSwitchProps {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ enabled, onChange }) => {
    return (
        <button
            type="button"
            onClick={() => onChange(!enabled)}
            className={`${enabled ? 'bg-indigo-600' : 'bg-slate-700'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800`}
        >
            <span
                aria-hidden="true"
                className={`${enabled ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
            />
        </button>
    );
};

interface CardProps {
  title: string;
  description: string;
  onClick: () => void;
}

export const Card: React.FC<CardProps> = ({ title, description, onClick }) => (
  <div 
    onClick={onClick}
    className="bg-slate-850 p-6 rounded-xl border border-slate-700 hover:border-indigo-500 hover:bg-slate-800 cursor-pointer transition-all duration-300 transform hover:-translate-y-1"
  >
    <h3 className="text-2xl font-bold text-white mb-3">{title}</h3>
    <p className="text-slate-400">{description}</p>
  </div>
);
