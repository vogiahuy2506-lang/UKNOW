import { findAllPlans } from "../../repositories/payment/plan.repository.js";

export const getAllPlans = async () => {
    return await findAllPlans();
};
