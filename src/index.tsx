import React from 'react';
import ReactDOM from 'react-dom/client';
import { initializeColorVariables } from './constants/colors';
import reportWebVitals from './reportWebVitals';
import { Dashboard } from './components/dashboard/dashboard';
import './constants/root.css';

initializeColorVariables();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <div
      style={{
        height: '100%',
        width: '100%',
        position: 'relative',
        backgroundColor: '#0f172a',
      }}
    >
      <Dashboard />
    </div>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
