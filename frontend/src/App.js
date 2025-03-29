import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Lobby from './components/Lobby';
import Room from './components/Room';
import { useState, useContext } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { SocketProvider } from './context/SocketContext';
import { UserProvider, UserContext } from './context/UserContext';

function App() {
  const [nickname, setNickname] = useState(sessionStorage.getItem('nickname'));

  return (
    <UserProvider>
      <SocketProvider>
        <AppContent nickname={nickname} setNickname={setNickname} />
      </SocketProvider>
    </UserProvider>
  );
}

function AppContent({ nickname, setNickname }) {
  const { userId } = useContext(UserContext);

  return (
    <Router>
      <Routes>
        <Route 
          path="/" 
          element={<Lobby nickname={nickname} setNickname={setNickname} userId={userId} />} 
        />
        <Route 
          path="/room/:roomId" 
          element={nickname ? <Room nickname={nickname} /> : <Navigate to="/" />} 
        />
        {/* 다른 경로로 접근시 로비로 리다이렉트 */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <ToastContainer 
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        closeOnClick
        pauseOnHover
      />
    </Router>
  );
}

export default App; 