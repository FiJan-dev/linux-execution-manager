# Linux Execution Manager

Base do Projeto 2 de Computação em Nuvem. O `Vagrantfile` prepara uma VM Linux
com ferramentas para namespaces e cgroups v2 e faz o clone do repositório.
Todo o provisionamento está nesse arquivo.

## Como usar

Instalar Vagrant e VirtualBox no computador, reservar 4 GB de RAM para a VM
e ter acesso à internet para baixar a imagem, os pacotes e o repositório.

Em uma pasta contendo somente o `Vagrantfile`:

```sh
vagrant validate
vagrant up --provider=virtualbox
vagrant ssh
```

Dentro da VM, o código fica em `/opt/linux-execution-manager`, pertencente ao
usuário `vagrant`. O repositório remoto e a referência configurada precisam
existir e estar acessíveis pela VM. Arquivos locais ainda não publicados não
fazem parte do clone.

## Ambiente

- Ubuntu 22.04, 2 CPUs e 4096 MB de RAM.
- Git, curl, compiladores, Python 3 e ferramentas dos exercícios.
- Verificação de cgroups v2 e dos controladores `cpu`, `memory` e `io`.
- Pasta compartilhada `/vagrant` desativada.
- Clone e checkout do Git durante o provisionamento.

O código clonado fica disponível para desenvolvimento. O provisionamento não
instala nem inicia uma aplicação.

## Configuração do clone

| Variável | Padrão |
| --- | --- |
| `LEM_REPO_URL` | `https://github.com/FiJan-dev/linux-execution-manager.git` |
| `LEM_REPO_REF` | `main` |

`LEM_REPO_REF` aceita branch, tag ou SHA de commit. Definir as variáveis antes
de executar os comandos Vagrant e manter os mesmos valores nos comandos seguintes.
O acesso padrão usa HTTPS sem login; repositórios privados exigem configurar
as credenciais Git dentro da VM.

## Comandos úteis

```sh
vagrant status       # consultar a VM
vagrant provision    # preparar o ambiente e atualizar o clone
vagrant halt         # desligar, preservando os arquivos
vagrant up           # ligar novamente
```

A atualização é interrompida se houver alterações locais no clone ou arquivos
preexistentes no diretório de destino sem um repositório Git.

Para conferir os recursos dentro da VM:

```sh
stat -fc %T /sys/fs/cgroup
cat /sys/fs/cgroup/cgroup.controllers
```

Os PDFs da especificação e de `ref-cgroup/` orientam o desenvolvimento.
`cloud-task-manager/` permanece como referência local, ignorada no Git.
