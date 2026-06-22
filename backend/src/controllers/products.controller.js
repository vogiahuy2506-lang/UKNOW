import { serverError } from '../helpers.js';
import productService from '../services/products/product.service.js';

class ProductsController {
  async getAll(req, res) {
    try {
      const data = await productService.getAll({
        query: req.query,
        user: req.user,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return serverError(res, 'getAll products', error);
    }
  }

  async getById(req, res) {
    try {
      const product = await productService.getById({
        productId: Number(req.params.id),
        user: req.user,
      });
      return res.json({ success: true, data: product });
    } catch (error) {
      if (error.status === 404 || error.status === 403) {
        return res.status(error.status).json({ success: false, message: error.message });
      }
      return serverError(res, 'getById product', error);
    }
  }

  async create(req, res) {
    try {
      const product = await productService.create({
        payload: req.body,
        user: req.user,
      });
      return res.status(201).json({
        success: true,
        message: 'Tạo sản phẩm thành công',
        data: product,
      });
    } catch (error) {
      if (error.status === 400) {
        return res.status(400).json({ success: false, message: error.message });
      }
      return serverError(res, 'create product', error);
    }
  }

  async update(req, res) {
    try {
      const product = await productService.update({
        productId: Number(req.params.id),
        payload: req.body,
        user: req.user,
      });
      return res.json({
        success: true,
        message: 'Cập nhật sản phẩm thành công',
        data: product,
      });
    } catch (error) {
      if (error.status === 400 || error.status === 404 || error.status === 403) {
        return res.status(error.status).json({ success: false, message: error.message });
      }
      return serverError(res, 'update product', error);
    }
  }

  async remove(req, res) {
    try {
      await productService.remove({
        productId: Number(req.params.id),
        user: req.user,
      });
      return res.json({ success: true, message: 'Xóa sản phẩm thành công' });
    } catch (error) {
      if (error.status === 404 || error.status === 403) {
        return res.status(error.status).json({ success: false, message: error.message });
      }
      return serverError(res, 'remove product', error);
    }
  }
}

export default new ProductsController();
