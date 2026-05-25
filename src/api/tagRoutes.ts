import { Router, Request, Response } from 'express';
import { tagManager } from '../core/TagManager';
import { licenseManager } from '../core/LicenseManager';

const router = Router();

// GET / — List all tags
router.get('/', (req: Request, res: Response) => {
  try {
    const connectionId = req.query.connectionId ? parseInt(req.query.connectionId as string) : undefined;
    const tags = connectionId
      ? tagManager.getTagsByConnection(connectionId)
      : tagManager.getAllTags();
    res.json({ data: tags });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /groups — List unique group names
router.get('/groups', (_req: Request, res: Response) => {
  try {
    const groups = tagManager.getGroups();
    res.json({ data: groups });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /:id — Get single tag
router.get('/:id', (req: Request, res: Response) => {
  try {
    const tag = tagManager.getTag(parseInt(req.params.id));
    if (!tag) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ data: tag });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST / — Create new tag
router.post('/', (req: Request, res: Response) => {
  try {
    // License check
    const check = licenseManager.canCreateTags(1);
    if (!check.allowed) {
      return res.status(403).json({ success: false, message: check.message, upgrade: true });
    }
    const tag = tagManager.createTag(req.body);
    console.log(`📊 Tag "${tag.name}" created (${tag.address})`);
    res.status(201).json({ data: tag });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /:id — Update tag
router.put('/:id', (req: Request, res: Response) => {
  try {
    const tag = tagManager.updateTag(parseInt(req.params.id), req.body);
    res.json({ data: tag });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /:id — Delete tag
router.delete('/:id', (req: Request, res: Response) => {
  try {
    tagManager.deleteTag(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /:id/read — Read current value
router.post('/:id/read', async (req: Request, res: Response) => {
  try {
    const result = await tagManager.readTag(parseInt(req.params.id));
    if (!result) return res.status(404).json({ success: false, message: 'Tag not found' });
    res.json({ data: { tag: result.tag, value: result.value } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /read-batch — Read multiple tags
router.post('/read-batch', async (req: Request, res: Response) => {
  try {
    const { connectionId } = req.body;
    const values = await tagManager.readTagsByConnection(connectionId);
    res.json({ data: values });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
