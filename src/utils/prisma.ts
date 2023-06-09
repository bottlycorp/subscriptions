import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export const getUser = async(userId: string): Promise<any> => {
  return await prisma.user.findUnique({
    where: {
      userId
    }
  });
};