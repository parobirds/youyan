import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Trash2, Info, Key, Lock } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { clearAllData } from '@/storage';
import { getKeyFingerprint } from '@/crypto/ecdh';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { keyPair, sharedKey, leaveRoom } = useChatStore();

  const handleClearData = () => {
    if (confirm('确定要清除所有本地数据吗？此操作不可撤销。')) {
      clearAllData();
      leaveRoom();
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-[#EDEDED] flex flex-col">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 text-gray-600 hover:text-gray-800 active:opacity-70"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="flex-1 text-center text-lg font-medium text-gray-800 pr-8">
          设置
        </h1>
      </div>

      <div className="flex-1 p-4 space-y-4">
        <div className="bg-white rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#07C160]" />
              加密信息
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                  <Key className="w-4 h-4 text-[#07C160]" />
                </div>
                <div>
                  <p className="text-sm text-gray-800">加密算法</p>
                  <p className="text-xs text-gray-400">ECDH P-256 + AES-256-GCM</p>
                </div>
              </div>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <Lock className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-gray-800">我的公钥指纹</p>
                  <p className="text-xs text-gray-400 font-mono">
                    {keyPair ? getKeyFingerprint(keyPair.publicKey) : '未连接'}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                  <Shield className="w-4 h-4 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-gray-800">会话密钥状态</p>
                  <p className="text-xs text-gray-400">
                    {sharedKey ? '已建立共享密钥' : '等待密钥交换'}
                  </p>
                </div>
              </div>
              {sharedKey && (
                <span className="px-2 py-1 bg-green-50 text-[#07C160] text-xs rounded-full">
                  已验证
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Info className="w-4 h-4 text-gray-500" />
              关于
            </h2>
          </div>
          <div className="px-4 py-3">
            <p className="text-sm text-gray-600 leading-relaxed">
              有言是一款端对端加密即时通讯应用。所有消息在发送前均在本地加密，
              仅接收方可以解密。服务器仅传输密文，无法读取任何消息内容。
            </p>
            <div className="mt-4 pt-4 border-t border-gray-50">
              <p className="text-xs text-gray-400">
                安全技术：
              </p>
              <ul className="text-xs text-gray-400 mt-2 space-y-1">
                <li>• ECDH P-256 椭圆曲线密钥交换</li>
                <li>• AES-256-GCM 对称加密</li>
                <li>• 消息认证码防止篡改</li>
                <li>• 本地加密存储</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl overflow-hidden">
          <button
            onClick={handleClearData}
            className="w-full px-4 py-3 flex items-center gap-3 text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
            <span className="text-sm font-medium">清除所有本地数据</span>
          </button>
        </div>

        <div className="text-center py-4">
          <p className="text-xs text-gray-400">有言 v1.0.0</p>
          <p className="text-xs text-gray-300 mt-1">E2EE Secure Chat</p>
        </div>
      </div>
    </div>
  );
}
