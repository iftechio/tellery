import { saveTranscations } from '@app/api'
import { getSubsetOfBlocksSnapshot } from '@app/components/editor/utils'
import {
  createThoughtTranscation,
  createTranscation,
  duplicateStoryTranscation,
  insertBlocksAndMoveOperations,
  moveBlocksTranscation
} from '@app/context/editorTranscations'
import { createEmptyBlock } from '@app/helpers/blockFactory'
import { useWorkspace } from '@app/hooks/useWorkspace'
import { getBlockFromSnapshot } from '@app/store/block'
import { Editor, Permission } from '@app/types'
import { blockIdGenerator } from '@app/utils'
import debug from 'debug'
import React, { useCallback, useContext } from 'react'
import invariant from 'tiny-invariant'
import { useGetBlock } from './api'
import { useLoggedUser } from './useAuth'
import { Operation, useCommit } from './useCommit'

export const logger = debug('tellery:blocktranscations')

export const useBlockTranscationProvider = () => {
  const commit = useCommit()
  const workspace = useWorkspace()
  const user = useLoggedUser()
  const getBlock = useGetBlock()

  const moveBlocks = useCallback(
    async (storyId, { blocksFragment, targetBlockId, direction }) => {
      const targetBlock = await getBlock(targetBlockId)
      return commit({
        transcation: (snapshot) =>
          moveBlocksTranscation({
            storyId,
            sourceBlockFragment: blocksFragment,
            targetBlock: targetBlock,
            direction,
            deleteSourceBlock: true
          }),
        storyId
      })
    },
    [commit, getBlock]
  )

  const createNewThought = useCallback(
    async (props: { id?: string }) => {
      const thoughtId = props.id ?? blockIdGenerator()
      return commit({
        transcation: createThoughtTranscation({ id: thoughtId, workspaceId: workspace.id, userId: user.id })
      })
    },
    [commit, user.id, workspace.id]
  )

  const createNewStory = useCallback(
    async (props?: { id: string; title?: string }) => {
      const id = props?.id ? props.id : blockIdGenerator()
      const title = props?.title ? props.title : undefined
      return commit({
        storyId: id,
        transcation: createTranscation({
          operations: [
            {
              cmd: 'set',
              id: id,
              path: [],
              table: 'block',
              args: createEmptyBlock({
                id: id,
                parentId: workspace.id,
                parentTable: Editor.BlockParentType.WORKSPACE,
                format: {},
                content: { title: title ? [[title]] : [] },
                children: [],
                type: Editor.BlockType.Story,
                storyId: id,
                permissions: [{ role: 'manager', type: 'workspace' }]
              })
            }
          ]
        })
      })
    },
    [commit, workspace.id]
  )

  const insertBlocks = useCallback(
    async (
      storyId: string,
      {
        blocksFragment,
        targetBlockId,
        direction,
        path = 'children'
      }: {
        blocksFragment: { children: string[]; data: Record<string, Editor.Block> }
        targetBlockId: string
        direction: 'top' | 'left' | 'bottom' | 'right' | 'child'
        path?: 'children'
      }
    ) => {
      const targetBlock = await getBlock(targetBlockId)

      return commit({
        transcation: (snapshot) => {
          return createTranscation({
            operations: insertBlocksAndMoveOperations({
              storyId,
              blocksFragment,
              targetBlock: targetBlock,
              direction,
              path
            })
          })
        },
        storyId
      })
    },
    [commit, getBlock]
  )

  const removeBlocks = useCallback(
    (storyId: string, targetBlockIds: string[], path: 'children' = 'children') => {
      return commit({
        transcation: (snapshot) => {
          const operations: Operation[] = []
          targetBlockIds.forEach((targetId) => {
            const targetBlock = getBlockFromSnapshot(targetId, snapshot)
            operations.push(
              ...[
                {
                  cmd: 'listRemove',
                  id: targetBlock.parentId,
                  path: [path],
                  args: { id: targetBlock.id },
                  table: 'block'
                }
              ]
            )
            if (storyId === targetBlock.storyId) {
              operations.push({
                cmd: 'update',
                id: targetId,
                path: ['alive'],
                args: false,
                table: 'block'
              })
            }
          })

          return createTranscation({ operations: operations })
        },
        storyId
      })
    },
    [commit]
  )

  const updateBlockPermissions = useCallback(
    (storyId: string, permissions: Permission[]) => {
      return commit({
        storyId: storyId,
        transcation: createTranscation({
          operations: [
            {
              cmd: 'setPermissions',
              id: storyId,
              args: permissions,
              path: ['permissions'],
              table: 'block'
            }
          ]
        })
      })
    },
    [commit]
  )

  const updateBlockProps = useCallback(
    (storyId: string, blockId: string, path: string[], args: any) => {
      return commit({
        storyId: storyId,
        transcation: createTranscation({
          operations: [
            {
              cmd: 'set',
              id: blockId,
              args: args,
              path: path,
              table: 'block'
            }
          ]
        })
      })
    },
    [commit]
  )

  // TODO: use commit
  const pinStory = useCallback(
    (workspaceViewId: string, storyId: string) => {
      return saveTranscations([
        {
          ...createTranscation({
            operations: [
              {
                cmd: 'listBefore',
                table: 'workspaceView',
                id: workspaceViewId,
                args: {
                  id: storyId
                },
                path: ['pinnedList']
              }
            ]
          }),
          workspaceId: workspace.id
        }
      ])
    },
    [workspace.id]
  )

  // TODO: use commit
  const unpinStory = useCallback(
    (workspaceViewId: string, storyId: string) => {
      return saveTranscations([
        {
          ...createTranscation({
            operations: [
              {
                cmd: 'listRemove',
                table: 'workspaceView',
                id: workspaceViewId,
                args: {
                  id: storyId
                },
                path: ['pinnedList']
              }
            ]
          }),
          workspaceId: workspace.id
        }
      ])
    },
    [workspace.id]
  )

  const deleteStory = useCallback(
    (storyId: string) => {
      return commit({
        storyId: storyId,
        transcation: createTranscation({
          operations: [
            {
              cmd: 'update',
              table: 'block',
              id: storyId,
              args: false,
              path: ['alive']
            }
          ]
        })
      })
    },
    [commit]
  )

  const duplicateStory = useCallback(
    async (storyId: string, newStoryId: string) => {
      // const newStoryId: string = ''
      return commit({
        transcation: (snapshot) => {
          const transcation = duplicateStoryTranscation({ storyId, snapshot, newStoryId, wroskapceId: workspace.id })
          // newStoryId = storyId
          return transcation
        },
        storyId: storyId,
        shouldReformat: false
      })
    },
    [commit, workspace.id]
  )

  return {
    moveBlocks,
    createNewStory,
    removeBlocks,
    insertBlocks,
    updateBlockPermissions,
    pinStory,
    unpinStory,
    deleteStory,
    duplicateStory,
    createNewThought,
    updateBlockProps
  }
}

export const BlockTranscationsContext = React.createContext<ReturnType<typeof useBlockTranscationProvider> | null>(null)

export const useBlockTranscations = () => {
  const context = useContext(BlockTranscationsContext)
  invariant(context, 'useBlockTranscations must use in provider')
  return context
}
