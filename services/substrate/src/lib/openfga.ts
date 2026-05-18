import { OpenFgaClient } from '@openfga/sdk';
import { config } from '../config.js';

// Singleton OpenFGA client
export const fga = new OpenFgaClient({
  apiUrl: config.OPENFGA_API_URL,
  storeId: config.OPENFGA_STORE_ID,
  authorizationModelId: config.OPENFGA_MODEL_ID,
});

/**
 * Check if a user has a relation to an object in OpenFGA.
 * Returns true if the relationship exists.
 */
export async function checkRelation(
  user: string,
  relation: string,
  object: string,
): Promise<boolean> {
  // authorization_model_id goes in options (second arg) in SDK 0.6.x
  const result = await fga.check(
    { user, relation, object },
    { authorizationModelId: config.OPENFGA_MODEL_ID },
  );
  return result.allowed ?? false;
}

/**
 * Write relationship tuples to OpenFGA.
 */
export async function writeTuples(
  tuples: Array<{ user: string; relation: string; object: string }>,
): Promise<void> {
  // SDK 0.6.x: writes/deletes are flat arrays, options go in second arg
  await fga.write(
    { writes: tuples },
    { authorizationModelId: config.OPENFGA_MODEL_ID },
  );
}

/**
 * Delete relationship tuples from OpenFGA.
 */
export async function deleteTuples(
  tuples: Array<{ user: string; relation: string; object: string }>,
): Promise<void> {
  await fga.write(
    { deletes: tuples },
    { authorizationModelId: config.OPENFGA_MODEL_ID },
  );
}
