import '@/index.css';

function App() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '12px',
        background: 'var(--color-bg-primary)',
        color: 'var(--color-text-primary)',
        fontFamily: 'var(--font-display)',
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>
        🚀 FlowBoard
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
        Scaffold complete — ready for implementation.
      </p>
    </div>
  );
}

export default App;
