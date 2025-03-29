import React, { createContext, useState, useEffect } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // 소켓 연결 생성
    const newSocket = io('http://localhost:3001');
    
    // 소켓 연결 이벤트 로깅
    newSocket.on('connect', () => {
      console.log('소켓 서버에 연결되었습니다.');
    });
    
    newSocket.on('disconnect', () => {
      console.log('소켓 서버와 연결이 끊어졌습니다.');
    });
    
    newSocket.on('error', (error) => {
      console.error('소켓 오류:', error);
    });
    
    setSocket(newSocket);

    // 컴포넌트 언마운트 시 소켓 연결 해제
    return () => {
      newSocket.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

export { SocketContext }; 