-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "email" TEXT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
