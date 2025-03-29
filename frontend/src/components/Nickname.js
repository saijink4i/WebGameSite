import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Nickname({ setNickname }) {
  const [inputValue, setInputValue] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      sessionStorage.setItem('nickname', inputValue);
      setNickname(inputValue);
      navigate('/lobby');
    }
  };

  return (
    <div className="nickname-container">
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="닉네임을 입력하세요"
        />
        <button type="submit">입장하기</button>
      </form>
    </div>
  );
}

export default Nickname; 