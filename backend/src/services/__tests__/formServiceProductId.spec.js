import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const findById = jest.fn();
const createForm = jest.fn();
const updateForm = jest.fn();
const findFormByIdAndOwner = jest.fn();

jest.unstable_mockModule('../../repositories/products/product.repository.js', () => ({
  default: { findById },
}));
jest.unstable_mockModule('../../repositories/form.repository.js', () => ({
  default: { createForm, updateForm, findFormByIdAndOwner },
  MAX_FORM_RESPONDENT_EMAILS_PER_24H: 100,
  MAX_CONFIRMATION_EMAILS_PER_RECIPIENT_PER_24H: 10,
}));

const { default: formService } = await import('../form.service.js');

beforeEach(() => {
  findById.mockReset();
  createForm.mockReset().mockImplementation(async (p) => ({ id: 1, theme: {}, ...p }));
  updateForm.mockReset().mockImplementation(async (_id, _owner, p) => ({ id: 1, theme: {}, ...p }));
  findFormByIdAndOwner.mockReset().mockResolvedValue({ id: 1, theme: {} });
});

describe('form.service gắn sản phẩm (productId)', () => {
  it('createForm: sản phẩm không thuộc workspace → 400 PRODUCT_NOT_IN_WORKSPACE, không ghi', async () => {
    findById.mockResolvedValue(null);
    await expect(
      formService.createForm({ workspaceOwnerId: 5, createdByUserId: 5, title: 'F', productId: 77 })
    ).rejects.toMatchObject({ statusCode: 400, code: 'PRODUCT_NOT_IN_WORKSPACE' });
    expect(findById).toHaveBeenCalledWith(77, { workspaceOwnerId: 5 });
    expect(createForm).not.toHaveBeenCalled();
  });

  it('createForm: sản phẩm cùng workspace → ghi productId', async () => {
    findById.mockResolvedValue({ id: 77 });
    await formService.createForm({ workspaceOwnerId: 5, createdByUserId: 5, title: 'F', productId: '77' });
    expect(createForm.mock.calls[0][0].productId).toBe(77);
  });

  it('createForm: không gửi productId → null, không tra sản phẩm', async () => {
    await formService.createForm({ workspaceOwnerId: 5, createdByUserId: 5, title: 'F' });
    expect(findById).not.toHaveBeenCalled();
    expect(createForm.mock.calls[0][0].productId).toBeNull();
  });

  it('updateForm: sản phẩm workspace khác → 400, không ghi', async () => {
    findById.mockResolvedValue(null);
    await expect(formService.updateForm(1, 5, { productId: 88 })).rejects.toMatchObject({
      statusCode: 400,
      code: 'PRODUCT_NOT_IN_WORKSPACE',
    });
    expect(updateForm).not.toHaveBeenCalled();
  });

  it('updateForm: productId null → bỏ gắn; không gửi productId → không đụng cột', async () => {
    await formService.updateForm(1, 5, { productId: null });
    expect(updateForm.mock.calls[0][2].productId).toBeNull();
    await formService.updateForm(1, 5, { title: 'Mới' });
    expect('productId' in updateForm.mock.calls[1][2]).toBe(false);
  });
});
