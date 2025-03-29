import React, { createContext, useState, useEffect } from 'react';

const UserContext = createContext({
  user: null,
  setUser: () => {},
  isLoggedIn: false,
  login: () => {},
  logout: () => {}
});

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  
  // 로컬 스토리지에서 사용자 정보 불러오기
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('사용자 정보 파싱 오류:', error);
        localStorage.removeItem('user');
      }
    }
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
        updateUser
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export { UserContext }; 