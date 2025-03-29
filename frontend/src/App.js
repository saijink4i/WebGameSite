import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Lobby from './components/Lobby';
import Room from './components/Room';
import { useState } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { SocketProvider } from './context/SocketContext';
import { UserProvider } from './context/UserContext';

function App() {
  const [nickname, setNickname] = useState(sessionStorage.getItem('nickname'));

  return (
    <SocketProvider>
      <UserProvider>
        <Router>
          <Routes>
            <Route 
              path="/" 
              element={<Lobby nickname={nickname} setNickname={setNickname} />} 
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
      </UserProvider>
    </SocketProvider>
  );
}

export default App; 