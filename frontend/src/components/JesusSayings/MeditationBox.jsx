// frontend/src/components/JesusSayings/MeditationBox.jsx
//
// 말씀 상세 우측에 붙는 묵상 작성/조회 박스

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import {
  getMeditationBySaying,
  createMeditation,
  updateMeditation,
  deleteMeditation,
} from '../../api/sayings';

export default function MeditationBox({ sayingId }) {
  const { isAuthenticated } = useAuth();
  const [meditations, setMeditations] = useState([]);
  const [content, setContent]         = useState('');
  const [editId, setEditId]           = useState(null);
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !sayingId) return;
    getMeditationBySaying(sayingId).then(d => {
      if (Array.isArray(d)) setMeditations(d);
    });
  }, [isAuthenticated, sayingId]);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    if (editId) {
      const updated = await updateMeditation(editId, { content, saying: sayingId });
      if (updated) {
        setMeditations(m => m.map(x => x.id === editId ? updated : x));
        setEditId(null);
      }
    } else {
      const created = await createMeditation({ content, saying: sayingId });
      if (created) setMeditations(m => [created, ...m]);
    }
    setContent('');
    setSaving(false);
  };

  const handleEdit = (m) => { setEditId(m.id); setContent(m.content); };

  const handleDelete = async (id) => {
    if (!window.confirm('이 묵상을 삭제하시겠습니까?')) return;
    const ok = await deleteMeditation(id);
    if (ok) setMeditations(m => m.filter(x => x.id !== id));
  };

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">내 묵상 노트</p>

      {isAuthenticated ? (
        <div className="border rounded-lg overflow-hidden" style={{ borderColor: '#e5e7eb' }}>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={4}
            placeholder="이 말씀을 통해 받은 은혜를 기록하세요..."
            className="w-full px-3 py-2.5 text-sm outline-none resize-none"
            style={{ fontFamily: "'Gowun Batang', serif", lineHeight: 1.7, color: '#1f2937' }}
          />
          <div className="flex items-center justify-between px-3 py-2 border-t" style={{ borderColor: '#e5e7eb', background: '#f9fafb' }}>
            {editId && (
              <button
                onClick={() => { setEditId(null); setContent(''); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                취소
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !content.trim()}
              className="ml-auto px-3 py-1 text-xs text-white rounded"
              style={{ background: '#3C3489', opacity: saving || !content.trim() ? 0.5 : 1 }}
            >
              {saving ? '저장 중...' : editId ? '수정 완료' : '저장'}
            </button>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg p-3 text-center" style={{ borderColor: '#e5e7eb', background: '#f9fafb' }}>
          <p className="text-xs text-gray-400 mb-2">묵상 노트를 작성하려면 로그인이 필요합니다.</p>
          <Link
            to="/login"
            className="text-xs px-3 py-1 rounded text-white"
            style={{ background: '#3C3489' }}
          >
            로그인
          </Link>
        </div>
      )}

      {/* 기존 묵상 목록 */}
      {meditations.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {meditations.map(m => (
            <div key={m.id} className="border rounded-lg p-3" style={{ borderColor: '#e5e7eb', background: '#fff' }}>
              <p className="text-xs text-gray-500 leading-relaxed" style={{ fontFamily: "'Gowun Batang', serif" }}>
                {m.content}
              </p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-300">
                  {new Date(m.created_at).toLocaleDateString('ko-KR')}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(m)} className="text-xs text-gray-400 hover:text-gray-700">수정</button>
                  <button onClick={() => handleDelete(m.id)} className="text-xs text-gray-400 hover:text-red-500">삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}