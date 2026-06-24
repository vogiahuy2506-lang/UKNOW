import express from 'express';
import { body, param } from 'express-validator';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import productsController from '../controllers/products.controller.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/', productsController.getAll.bind(productsController));

router.get('/categories', productsController.getCategories.bind(productsController));

router.get(
  '/:id',
  [param('id').isInt({ min: 1 })],
  handleValidationErrors,
  productsController.getById.bind(productsController)
);

router.post(
  '/',
  [
    body('productName').trim().notEmpty().withMessage('Tên sản phẩm không được để trống'),
    body('productCode').optional({ nullable: true }).trim(),
    body('price').optional({ nullable: true }).trim(),
    body('originalPrice').optional({ nullable: true }).trim(),
    body('description').optional({ nullable: true }).trim(),
    body('usp').optional({ nullable: true }).trim(),
    body('category').optional({ nullable: true }).trim(),
    body('thumbnailUrl').optional({ nullable: true }).trim(),
    body('productUrl').optional({ nullable: true }).trim(),
    body('targetAudience').optional({ nullable: true }).trim(),
    body('status').optional({ nullable: true }).trim(),
  ],
  handleValidationErrors,
  productsController.create.bind(productsController)
);

router.put(
  '/:id',
  [
    param('id').isInt({ min: 1 }),
    body('productName').optional({ nullable: true }).trim().notEmpty().withMessage('Tên sản phẩm không được để trống'),
    body('productCode').optional({ nullable: true }).trim(),
    body('price').optional({ nullable: true }).trim(),
    body('originalPrice').optional({ nullable: true }).trim(),
    body('description').optional({ nullable: true }).trim(),
    body('usp').optional({ nullable: true }).trim(),
    body('category').optional({ nullable: true }).trim(),
    body('thumbnailUrl').optional({ nullable: true }).trim(),
    body('productUrl').optional({ nullable: true }).trim(),
    body('targetAudience').optional({ nullable: true }).trim(),
    body('status').optional({ nullable: true }).trim(),
  ],
  handleValidationErrors,
  productsController.update.bind(productsController)
);

router.delete(
  '/:id',
  [param('id').isInt({ min: 1 })],
  handleValidationErrors,
  productsController.remove.bind(productsController)
);

export default router;
