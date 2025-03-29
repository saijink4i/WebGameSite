import React, { createContext, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

const UserContext = createContext({
  user: null,
  setUser: () => {},
  isLoggedIn: false,
  login: () => {},
  logout: () => {},
  updateUser: () => {},
  userId: null
});

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState(null);
  
  // 로컬 스토리지에서 사용자 정보와 고유 ID 불러오기
  useEffect(() => {
    // 사용자 정보 로드
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('사용자 정보 파싱 오류:', error);
        localStorage.removeItem('user');
      }
    }
    
    // 고유 사용자 ID 로드 또는 생성
    let storedUserId = localStorage.getItem('userId');
    if (!storedUserId) {
      storedUserId = uuidv4();
      localStorage.setItem('userId', storedUserId);
    }
    setUserId(storedUserId);
  }, []);
  
  // 로그인 함수
  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };
  
  // 로그아웃 함수
  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    // userId는 유지합니다 - 브라우저/디바이스마다 고유한 식별자로 사용
  };
  
  // 사용자 정보 업데이트 함수
  const updateUser = (updatedData) => {
    const updatedUser = { ...user, ...updatedData };
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };
  
  return (
    <UserContext.Provider 
      value={{ 
        user, 
        setUser, 
        isLoggedIn: !!user, 
        login, 
        logout,
        updateUser,
        userId
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export { UserContext }; 