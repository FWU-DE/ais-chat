import { dbCreateOrUpdateUser } from '../functions/user';

export async function insertDummyUser() {
  await dbCreateOrUpdateUser({
    id: PLACEHOLDER_USER_ID,
    federalStateId: DUMMY_USER_FEDERAL_STATE_ID,
    userRole: 'teacher',
    schoolIds: [],
  });

  console.log('Dummy user seed successful');
}

export const PLACEHOLDER_USER_ID = 'e7cdbdd7-f950-47c5-9955-61e5172b39b0';
const DUMMY_USER_FEDERAL_STATE_ID = 'DE-TEST';
