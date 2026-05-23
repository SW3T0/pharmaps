import React from 'react';

interface AppContainerProps {
  children: React.ReactNode;
  mobileTab?: 'sidebar' | 'map' | 'chat';
}

export const AppContainer: React.FC<AppContainerProps> = ({ children, mobileTab }) => {
  return (
    <div className="app-container" data-mobile-tab={mobileTab || 'map'}>
      {children}
    </div>
  );
};
