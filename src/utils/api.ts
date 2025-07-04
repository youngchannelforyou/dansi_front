const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080') + "/api";

// API 응답 타입 정의
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  errorCode?: string;
}

// 회원 정보 타입
export interface Member {
  memberId: number;
  email: string;
  name: string;
  bio?: string;
  img?: string;
  createdAt: string;
  updatedAt: string;
}

// 키워드 타입
export interface Keyword {
  keyword: string;
}

// 시 타입 (프로필용)
export interface Poem {
  poemId: number;
  title: string;
  keyword: string;
  content: string;
  createdAt: string;
  viewCount: number;
  likeCount: number;
  member?: {
    memberId: number;
    name: string;
    img?: string;
  };
}

// 프로필 업데이트 요청 타입
export interface ProfileUpdateRequest {
  name: string;
  bio?: string;
  img?: string;
}

// 비밀번호 변경 요청 타입
export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

// 사용자 통계 타입
export interface MemberStats {
  totalWrites: number;
  totalLikes: number;
  totalViews: number;
  joinDate: string;
}

// 페이지네이션 응답 타입
export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

// 로그인 요청 타입
export interface LoginRequest {
  email: string;
  password: string;
}

// 회원가입 요청 타입
export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
}

// 로그인 응답 타입 (보안 강화)
export interface LoginResponse {
  member: Member;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

// 토큰 갱신 응답 타입
export interface RefreshTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

// API 호출 기본 함수 (자동 토큰 갱신 포함)
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Access Token 추가
  const accessToken = tokenStorage.getAccessToken();
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (accessToken) {
    defaultHeaders['Authorization'] = `Bearer ${accessToken}`;
  }
  
  const defaultOptions: RequestInit = {
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, defaultOptions);
    
    // 토큰 만료 시 자동 갱신 시도
    if (response.status === 401 && accessToken) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        // 새 토큰으로 재시도
        defaultOptions.headers = {
          ...defaultOptions.headers,
          'Authorization': `Bearer ${tokenStorage.getAccessToken()}`,
        };
        const retryResponse = await fetch(url, defaultOptions);
        const retryData = await retryResponse.json();
        
        if (!retryResponse.ok) {
          throw new Error(retryData.message || '서버 오류가 발생했습니다.');
        }
        
        return retryData;
      } else {
        // 갱신 실패 시 로그아웃 처리
        logout();
        throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
      }
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || '서버 오류가 발생했습니다.');
    }
    
    return data;
  } catch (error) {
    console.error('API 호출 오류:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '네트워크 오류가 발생했습니다.',
    };
  }
}

// 토큰 갱신 시도
async function tryRefreshToken(): Promise<boolean> {
  try {
    const refreshToken = tokenStorage.getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    const response = await fetch(`${API_BASE_URL}/members/refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        tokenStorage.setAccessToken(data.data.accessToken);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('토큰 갱신 오류:', error);
    return false;
  }
}

// 회원가입 API
export async function registerMember(data: RegisterRequest): Promise<ApiResponse<Member>> {
  return apiCall<Member>('/members', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// 로그인 API (보안 강화)
export async function loginMember(data: LoginRequest): Promise<ApiResponse<LoginResponse>> {
  return apiCall<LoginResponse>('/members/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// 토큰 검증 API (보안 강화)
export async function verifyToken(token: string): Promise<ApiResponse<{member: Member, accessToken: string, tokenType: string}>> {
  return apiCall<{member: Member, accessToken: string, tokenType: string}>('/members/verify-token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

// 토큰 갱신 API
export async function refreshAccessToken(): Promise<ApiResponse<RefreshTokenResponse>> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) {
    return {
      success: false,
      message: 'Refresh Token이 없습니다.',
    };
  }

  return apiCall<RefreshTokenResponse>('/members/refresh-token', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

// 로그아웃 API
export async function logoutMember(): Promise<ApiResponse<null>> {
  const refreshToken = tokenStorage.getRefreshToken();
  
  const response = await apiCall<null>('/members/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });

  // 로컬 스토리지 정리
  logout();
  
  return response;
}

// 모든 디바이스에서 로그아웃 API
export async function logoutAllDevices(): Promise<ApiResponse<null>> {
  const refreshToken = tokenStorage.getRefreshToken();
  
  const response = await apiCall<null>('/members/logout-all', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });

  // 로컬 스토리지 정리
  logout();
  
  return response;
}

// 이메일 중복 확인 API
export async function checkEmailExists(email: string): Promise<ApiResponse<boolean>> {
  const response = await apiCall<{exists: boolean}>(`/members/check-email/${encodeURIComponent(email)}`, {
    method: 'GET',
  });

  if (response.success && response.data) {
    return {
      success: true,
      message: response.message,
      data: response.data.exists
    };
  }

  return {
    success: false,
    message: response.message || '이메일 확인 중 오류가 발생했습니다.',
  };
}

// 회원 정보 조회 API
export async function getMemberInfo(memberId: number): Promise<ApiResponse<Member>> {
  return apiCall<Member>(`/members/${memberId}`, {
    method: 'GET',
  });
}

// 토큰 관리 함수들 (보안 강화)
export const tokenStorage = {
  setAccessToken: (token: string) => {
    localStorage.setItem('access_token', token);
  },
  
  getAccessToken: (): string | null => {
    return localStorage.getItem('access_token');
  },
  
  setRefreshToken: (token: string) => {
    localStorage.setItem('refresh_token', token);
  },
  
  getRefreshToken: (): string | null => {
    return localStorage.getItem('refresh_token');
  },
  
  removeTokens: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },
  
  isLoggedIn: (): boolean => {
    return !!(localStorage.getItem('access_token') && localStorage.getItem('refresh_token'));
  }
};

// 사용자 정보 관리 함수들
export const userStorage = {
  setUser: (user: Member) => {
    localStorage.setItem('user_info', JSON.stringify(user));
  },
  
  getUser: (): Member | null => {
    const userInfo = localStorage.getItem('user_info');
    return userInfo ? JSON.parse(userInfo) : null;
  },
  
  removeUser: () => {
    localStorage.removeItem('user_info');
  }
};

// 자동 로그인 확인 함수 (보안 강화)
export async function checkAutoLogin(): Promise<LoginResponse | null> {
  const accessToken = tokenStorage.getAccessToken();
  const refreshToken = tokenStorage.getRefreshToken();
  
  if (!accessToken || !refreshToken) {
    return null;
  }

  try {
    // 먼저 Access Token 검증
    const response = await verifyToken(accessToken);
    
    if (response.success && response.data) {
      // Access Token이 유효하면 사용자 정보 업데이트
      userStorage.setUser(response.data.member);
      
      return {
        member: response.data.member,
        accessToken: response.data.accessToken,
        refreshToken: refreshToken,
        tokenType: response.data.tokenType,
        expiresIn: 86400 // 24시간
      };
    } else {
      // Access Token이 유효하지 않으면 갱신 시도
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        // 갱신 성공 시 다시 검증
        const newAccessToken = tokenStorage.getAccessToken();
        if (newAccessToken) {
          const verifyResponse = await verifyToken(newAccessToken);
          if (verifyResponse.success && verifyResponse.data) {
            userStorage.setUser(verifyResponse.data.member);
            
            return {
              member: verifyResponse.data.member,
              accessToken: verifyResponse.data.accessToken,
              refreshToken: refreshToken,
              tokenType: verifyResponse.data.tokenType,
              expiresIn: 86400
            };
          }
        }
      }
      
      // 갱신 실패 시 로그아웃 처리
      logout();
      return null;
    }
  } catch (error) {
    console.error('자동 로그인 확인 오류:', error);
    logout();
    return null;
  }
}

// 로그아웃 함수 (보안 강화)
export function logout() {
  tokenStorage.removeTokens();
  userStorage.removeUser();
}

// 키워드 관련 API 함수들

// 랜덤 키워드 조회 - 지정된 개수만큼
export async function getRandomKeywords(limit: number = 50): Promise<ApiResponse<Keyword[]>> {
  return apiCall<Keyword[]>(`/keywords/random?limit=${limit}`, {
    method: 'GET',
  });
}

// 랜덤 키워드 1개 조회
export async function getRandomKeyword(): Promise<ApiResponse<Keyword>> {
  return apiCall<Keyword>('/keywords/random/single', {
    method: 'GET',
  });
}

// 모든 키워드 조회
export async function getAllKeywords(): Promise<ApiResponse<Keyword[]>> {
  return apiCall<Keyword[]>('/keywords', {
    method: 'GET',
  });
}

// 프로필 관련 API 함수들

// 프로필 정보 업데이트
export async function updateProfile(memberId: number, profileData: ProfileUpdateRequest): Promise<ApiResponse<Member>> {
  return apiCall<Member>(`/members/${memberId}/profile`, {
    method: 'PUT',
    body: JSON.stringify(profileData),
  });
}

// 비밀번호 변경
export async function changePassword(memberId: number, passwordData: PasswordChangeRequest): Promise<ApiResponse<null>> {
  return apiCall<null>(`/members/${memberId}/password`, {
    method: 'PUT',
    body: JSON.stringify(passwordData),
  });
}

// 사용자가 작성한 시 목록 조회
export async function getMemberPoems(memberId: number): Promise<ApiResponse<Poem[]>> {
  return apiCall<Poem[]>(`/members/${memberId}/poems`, {
    method: 'GET',
  });
}

// 사용자가 작성한 시 목록 조회 API (페이지네이션)
export async function getMemberPoemsWithPagination(
  memberId: number, 
  page: number = 0, 
  size: number = 10, 
  sort: string = 'createdAt', 
  direction: string = 'desc'
): Promise<ApiResponse<PageResponse<Poem>>> {
  return apiCall<PageResponse<Poem>>(`/members/${memberId}/poems/page?page=${page}&size=${size}&sort=${sort}&direction=${direction}`, {
    method: 'GET',
  });
}

// 사용자 통계 정보 조회
export async function getMemberStats(memberId: number): Promise<ApiResponse<MemberStats>> {
  return apiCall<MemberStats>(`/members/${memberId}/stats`, {
    method: 'GET',
  });
}

// 사용자 프로필 조회
export async function getMemberProfile(memberId: number): Promise<ApiResponse<Member>> {
  return apiCall<Member>(`/members/${memberId}`, {
    method: 'GET',
  });
}

// 시 작성 요청 타입
export interface PoemCreateRequest {
  keyword: string;
  title: string;
  content: string;
  memberId: number;
}

// 시 수정 요청 타입
export interface PoemUpdateRequest {
  keyword?: string;
  title?: string;
  content?: string;
}

// 시 관련 API 함수들

// 시 작성
export async function createPoem(poemData: PoemCreateRequest): Promise<ApiResponse<Poem>> {
  return apiCall<Poem>('/poems', {
    method: 'POST',
    body: JSON.stringify(poemData),
  });
}

// 시 조회 (ID로)
export async function getPoemById(poemId: number): Promise<ApiResponse<Poem>> {
  return apiCall<Poem>(`/poems/${poemId}`, {
    method: 'GET',
  });
}

// 시 목록 조회 (페이지네이션)
export async function getPoems(
  page: number = 0,
  size: number = 10,
  sort: string = 'latest'
): Promise<ApiResponse<PageResponse<Poem>>> {
  return apiCall<PageResponse<Poem>>(`/poems?page=${page}&size=${size}&sort=${sort}`, {
    method: 'GET',
  });
}

// 키워드로 시 검색
export async function getPoemsByKeyword(keyword: string): Promise<ApiResponse<Poem[]>> {
  return apiCall<Poem[]>(`/poems/search/keyword/${encodeURIComponent(keyword)}`, {
    method: 'GET',
  });
}

// 제목으로 시 검색
export async function getPoemsByTitle(title: string): Promise<ApiResponse<Poem[]>> {
  return apiCall<Poem[]>(`/poems/search/title?title=${encodeURIComponent(title)}`, {
    method: 'GET',
  });
}

// 작성자별 시 조회
export async function getPoemsByMember(memberId: number): Promise<ApiResponse<Poem[]>> {
  return apiCall<Poem[]>(`/poems/member/${memberId}`, {
    method: 'GET',
  });
}

// 시 수정
export async function updatePoem(poemId: number, memberId: number, poemData: PoemUpdateRequest): Promise<ApiResponse<Poem>> {
  return apiCall<Poem>(`/poems/${poemId}?memberId=${memberId}`, {
    method: 'PUT',
    body: JSON.stringify(poemData),
  });
}

// 시 삭제
export async function deletePoem(poemId: number, memberId: number): Promise<ApiResponse<null>> {
  return apiCall<null>(`/poems/${poemId}?memberId=${memberId}`, {
    method: 'DELETE',
  });
}

// ============== EXPLORE 페이지 관련 API ==============

// 댓글 타입 정의
export interface Comment {
  commentId: number;
  content: string;
  createdAt: string;
  poem: {
    poemId: number;
    title: string;
  };
  member: {
    memberId: number;
    name: string;
    img?: string;
  };
}

// 시 요약 타입 정의 (explore 페이지용)
export interface PoemSummary {
  poemId: number;
  title: string;
  keyword: string;
  content: string;
  createdAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  member?: {
    memberId: number;
    name: string;
    img?: string;
  };
}

// 키워드별 시 목록 조회 (PoemController의 /list 엔드포인트)
export async function getPoemsListByKeyword(keyword: string): Promise<ApiResponse<PoemSummary[]>> {
  const url = `/poems/list?keyword=${encodeURIComponent(keyword)}`;
  return apiCall<PoemSummary[]>(url);
}

// 시 상세 조회 (조회수 자동 증가)
export async function getPoemDetail(poemId: number): Promise<ApiResponse<Poem>> {
  return apiCall<Poem>(`/poems/${poemId}`);
}

// 좋아요 토글
export async function togglePoemLike(poemId: number, memberId: number): Promise<ApiResponse<{isLiked: boolean}>> {
  return apiCall<{isLiked: boolean}>('/likes/toggle', {
    method: 'POST',
    body: JSON.stringify({ 
      poem: { poemId }, 
      member: { memberId }
    })
  });
}

// 좋아요 상태 확인
export async function checkLikeStatus(poemId: number, memberId: number): Promise<ApiResponse<{isLiked: boolean}>> {
  const url = `/likes/check?poemId=${poemId}&memberId=${memberId}`;
  return apiCall<{isLiked: boolean}>(url);
}

// 좋아요 개수 조회
export async function getLikeCount(poemId: number): Promise<ApiResponse<{count: number}>> {
  return apiCall<{count: number}>(`/likes/poem/${poemId}/count`);
}

// 댓글 목록 조회
export async function getCommentsByPoem(poemId: number): Promise<ApiResponse<Comment[]>> {
  return apiCall<Comment[]>(`/comments/poem/${poemId}`);
}

// 댓글 개수 조회
export async function getCommentsCount(poemId: number): Promise<ApiResponse<{count: number}>> {
  return apiCall<{count: number}>(`/comments/poem/${poemId}/count`);
}

// 댓글 작성
export async function createComment(poemId: number, memberId: number, content: string): Promise<ApiResponse<Comment>> {
  return apiCall<Comment>('/comments', {
    method: 'POST',
    body: JSON.stringify({
      poem: { poemId },
      member: { memberId },
      content
    })
  });
}

// 댓글 삭제
export async function deleteComment(commentId: number, memberId: number): Promise<ApiResponse<null>> {
  return apiCall<null>(`/comments/${commentId}?memberId=${memberId}`, {
    method: 'DELETE',
  });
}

// 시 수정 페이지용 인터페이스
export interface PoemEditData {
  poemId: number;
  keyword: string;
  title: string;
  content: string;
} 