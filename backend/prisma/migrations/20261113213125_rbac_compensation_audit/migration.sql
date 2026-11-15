-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'HR_MANAGER');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "allowances" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bonus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deactivated_at" TIMESTAMP(3),
ADD COLUMN     "deductions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "salary_changes" ADD COLUMN     "allowances" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bonus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "changed_by_id" INTEGER,
ADD COLUMN     "deductions" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- AddForeignKey
ALTER TABLE "salary_changes" ADD CONSTRAINT "salary_changes_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
