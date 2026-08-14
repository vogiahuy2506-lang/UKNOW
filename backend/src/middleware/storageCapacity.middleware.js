import {
  assertStorageCapacity,
  StorageCapacityError,
  STORAGE_POOL_TYPES,
} from '../utils/storageCapacity.util.js';

export const storageCapacityGuard = ({
  paths,
  poolType = STORAGE_POOL_TYPES.WORKSPACE,
  shouldCheck = () => true,
}) => async (req, res, next) => {
  try {
    if (!shouldCheck(req)) return next();
    await assertStorageCapacity({ paths, poolType });
    return next();
  } catch (error) {
    if (!(error instanceof StorageCapacityError)) return next(error);
    return res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }
};
