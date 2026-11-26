import { createContext, useContext } from 'react';

export interface StaffMe {
  id: number;
  name: string;
  login: string;
  role: 'owner' | 'staff';
}
export const MeContext = createContext<StaffMe | null>(null);
/** The signed-in staff member (null outside the admin shell). */
export const useMe = () => useContext(MeContext);
