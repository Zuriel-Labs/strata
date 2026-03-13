import React from 'react';
import './App.css';
import { AppProvider, useAppState } from './store';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { BoardView, TableView, CalendarView } from './components/BoardView';
import { CardModal } from './components/CardModal';
import { SearchOverlay } from './components/SearchOverlay';
import { AutomationPanel } from './components/AutomationPanel';

const themeVars = {
  '--bg': '#0e0f13',
  '--sidebar-bg': '#131419',
  '--header-bg': '#131419',
  '--list-bg': '#181a21',
  '--list-hover-bg': '#1e2029',
  '--card-bg': '#1f2128',
  '--card-border': '#2a2c37',
  '--modal-bg': '#1a1c24',
  '--dropdown-bg': '#1a1c24',
  '--input-bg': '#14151b',
  '--border': '#2a2c37',
  '--active-bg': 'rgba(99,102,241,0.1)',
  '--accent': '#6366f1',
  '--text-primary': '#e8e9ed',
  '--text-secondary': '#9b9daa',
  '--text-muted': '#5c5e6e',
} as React.CSSProperties;

function AppInner() {
  const state = useAppState();
  const board = state.boards.find(b => b.id === state.currentBoardId);

  return (
    <div className="h-screen w-screen flex overflow-hidden" style={{ ...themeVars, background: 'var(--bg)', color: 'var(--text-primary)', fontFamily: "'DM Sans', 'Segoe UI', system-ui, -apple-system, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            {!board ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-5xl mb-4 opacity-30">📋</div>
                  <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Select a board</h2>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Pick a board from the sidebar to get started</p>
                </div>
              </div>
            ) : state.viewMode === 'board' ? (
              <BoardView />
            ) : state.viewMode === 'table' ? (
              <TableView />
            ) : (
              <CalendarView />
            )}
          </div>
          <AutomationPanel />
        </div>
      </div>
      {state.activeCardId && <CardModal key={state.activeCardId} />}
      <SearchOverlay />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
