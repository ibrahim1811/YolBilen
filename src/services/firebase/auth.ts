import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './config';
import type { User } from '../../types';

GoogleSignin.configure({
  webClientId: '611310540307-f7tm4vb84oe3coloom9fkehqob34fh1q.apps.googleusercontent.com',
});

export async function signInWithGoogle(): Promise<User> {
  await GoogleSignin.hasPlayServices();
  const { data } = await GoogleSignin.signIn();
  const credential = GoogleAuthProvider.credential(data?.idToken ?? null);
  const result = await signInWithCredential(auth, credential);

  const user: User = {
    uid: result.user.uid,
    displayName: result.user.displayName,
    email: result.user.email,
    photoURL: result.user.photoURL,
    isGuest: false,
    contributionPoints: 0,
    badges: [],
    coins: 0,
  };

  await upsertUser(user);
  return user;
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(result.user, { displayName });

  const user: User = {
    uid: result.user.uid,
    displayName,
    email: result.user.email,
    photoURL: null,
    isGuest: false,
    contributionPoints: 0,
    badges: [],
    coins: 0,
  };

  try { await upsertUser(user); } catch {}
  return user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);

  const fallback: User = {
    uid: result.user.uid,
    displayName: result.user.displayName,
    email: result.user.email,
    photoURL: result.user.photoURL,
    isGuest: false,
    contributionPoints: 0,
    badges: [],
    coins: 0,
  };

  try {
    const snap = await getDoc(doc(db, 'users', result.user.uid));
    if (snap.exists()) return snap.data() as User;
    await upsertUser(fallback);
  } catch {}

  return fallback;
}

export async function signInAsGuest(): Promise<User> {
  const result = await signInAnonymously(auth);
  const user: User = {
    uid: result.user.uid,
    displayName: 'Misafir',
    email: null,
    photoURL: null,
    isGuest: true,
    contributionPoints: 0,
    badges: [],
    coins: 0,
  };
  await upsertUser(user);
  return user;
}

export async function signOut(): Promise<void> {
  const isGoogle = !auth.currentUser?.isAnonymous && auth.currentUser?.providerData[0]?.providerId === 'google.com';
  await firebaseSignOut(auth);
  if (isGoogle) {
    await GoogleSignin.signOut();
  }
}

async function upsertUser(user: User): Promise<void> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) await setDoc(ref, { ...user, createdAt: new Date() });
}
