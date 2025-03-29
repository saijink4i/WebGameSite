import React, { createContext, useState, useEffect, useContext } from 'react';
import io from 'socket.io-client';
import { UserContext } from './UserContext';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const { userId } = useContext(UserContext);

  // userId가 로드된 후에만 소켓 연결 생성
  useEffect(() => {
    if (!userId) return;

    // userId를 쿼리 파라미터로 전달하여 소켓 연결 생성
    const newSocket = io('http://localhost:3001', {
      query: { userId }
    });
    
    // 소켓 연결 이벤트 로깅
    newSocket.on('connect', () => {
      console.log(`소켓 서버에 연결되었습니다. (userId: ${userId}, socketId: ${newSocket.id})`);
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
  }, [userId]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

export { SocketContext }; 