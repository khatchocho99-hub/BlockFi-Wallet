import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { auth, googleProvider } from '../lib/firebase';
import {
  createUserProfile,
  subscribeUserProfile,
} from '../services/firestoreService';
import { BOOTSTRAP_ADMIN_EMAIL, type UserProfile } from '../types/exchange';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  authLoading: boolean;
  profileLoading: boolean;
  needsRegistration: boolean;
  isAdmin: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  completeRegistration: (username: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let profileUnsub: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }

      if (!user) {
        setFirebaseUser(null);
        setProfile(null);
        setAuthLoading(false);
        setProfileLoading(false);
        return;
      }

      const email = (user.email || '').toLowerCase();
      if (!email.endsWith('@gmail.com') || !user.emailVerified) {
        await signOut(auth);
        setAuthError(
          'Access restricted: Only verified @gmail.com Google accounts are permitted on Veltrix Exchange.'
        );
        setFirebaseUser(null);
        setProfile(null);
        setAuthLoading(false);
        return;
      }

      setFirebaseUser(user);
      setAuthLoading(false);
      setProfileLoading(true);

      profileUnsub = subscribeUserProfile(user.uid, (nextProfile) => {
        setProfile(nextProfile);
        setProfileLoading(false);
      });
    });

    return () => {
      unsubAuth();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = (result.user.email || '').toLowerCase();
      if (!email.endsWith('@gmail.com') || !result.user.emailVerified) {
        await signOut(auth);
        setAuthError(
          'Only verified @gmail.com email addresses are allowed. Please sign in with a Gmail account.'
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    }
  };

  const completeRegistration = async (username: string) => {
    if (!firebaseUser || !firebaseUser.email) {
      throw new Error('No authenticated Google session');
    }
    setAuthError(null);
    await createUserProfile({
      uid: firebaseUser.uid,
      email: firebaseUser.email.toLowerCase(),
      username,
      photoURL: firebaseUser.photoURL || '',
    });
  };

  const logout = async () => {
    await signOut(auth);
    setProfile(null);
  };

  const isAdmin = useMemo(() => {
    if (!firebaseUser) return false;
    const email = (firebaseUser.email || '').toLowerCase();
    return email === BOOTSTRAP_ADMIN_EMAIL && firebaseUser.emailVerified;
  }, [firebaseUser]);

  const needsRegistration = Boolean(firebaseUser && !profileLoading && !profile);

  const value: AuthContextValue = {
    firebaseUser,
    profile,
    authLoading,
    profileLoading,
    needsRegistration,
    isAdmin,
    authError,
    clearAuthError: () => setAuthError(null),
    signInWithGoogle,
    completeRegistration,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
