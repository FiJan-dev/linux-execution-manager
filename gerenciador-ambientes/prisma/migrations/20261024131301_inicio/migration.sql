-- CreateTable
CREATE TABLE `scripts` (
    `id` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `tamanhoBytes` INTEGER NOT NULL,
    `conteudo` LONGTEXT NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `scripts_nome_key`(`nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ambientes` (
    `id` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `namespace` VARCHAR(191) NOT NULL,
    `cpu` DOUBLE NOT NULL,
    `memoriaMb` INTEGER NOT NULL,
    `ioMbps` INTEGER NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ambientes_nome_key`(`nome`),
    UNIQUE INDEX `ambientes_namespace_key`(`namespace`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `processos` (
    `id` VARCHAR(191) NOT NULL,
    `comando` VARCHAR(191) NOT NULL,
    `pid` INTEGER NOT NULL,
    `status` ENUM('executando', 'terminado', 'erro') NOT NULL,
    `codigoSaida` INTEGER NULL,
    `iniciadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finalizadoEm` DATETIME(3) NULL,
    `ambienteId` VARCHAR(191) NOT NULL,
    `scriptId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `processos` ADD CONSTRAINT `processos_ambienteId_fkey` FOREIGN KEY (`ambienteId`) REFERENCES `ambientes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `processos` ADD CONSTRAINT `processos_scriptId_fkey` FOREIGN KEY (`scriptId`) REFERENCES `scripts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
