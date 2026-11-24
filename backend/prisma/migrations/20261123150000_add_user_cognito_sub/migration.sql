-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cognito_sub" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "users_cognito_sub_key" ON "users"("cognito_sub");
