/**
 * DocumentsPanel — Reusable document / photo management panel.
 *
 * Props:
 *   entityType   'residence' | 'agreement' | 'employee'
 *   entityId     string
 *   docTypes     array of doc_type strings to show (filtered to entity's valid types)
 *   readOnly     boolean — hide upload / delete buttons
 *   onFilesChange  callback() fired after any mutation
 *   compact      boolean — smaller card style
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card, Button, Space, Tag, Typography, Spin, Empty,
  Modal, Popconfirm, message, Upload, Select, Tooltip,
  Badge, Image, Row, Col, Divider, Progress,
} from 'antd';
import {
  UploadOutlined, DeleteOutlined, EyeOutlined, DownloadOutlined,
  FilePdfOutlined, FileImageOutlined, IdcardOutlined, UserOutlined,
  HomeOutlined, FileProtectOutlined, FileOutlined, PlusOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import api from '../services/api';
import dayjs from 'dayjs';

const { Text, Title } = Typography;
const { Option } = Select;

// ─── Doc-type meta (mirrors backend constants) ────────────────────────────────

export const DOC_TYPE_CONFIG = {
  owner_photo:       { label: 'Owner Photo',          accept: 'image/jpeg,image/png,image/webp', icon: <HomeOutlined />,        single: true,  color: '#722ed1', maxMB: 5  },
  property_photo:    { label: 'Property Photos',       accept: 'image/jpeg,image/png,image/webp', icon: <FileImageOutlined />,   single: false, color: '#1677ff', maxMB: 5  },
  agreement_pdf:     { label: 'Agreement Soft Copy',   accept: 'application/pdf',                 icon: <FilePdfOutlined />,     single: false, color: '#d46b08', maxMB: 10 },
  employee_photo:    { label: 'Employee Photo',        accept: 'image/jpeg,image/png,image/webp', icon: <UserOutlined />,        single: true,  color: '#0958d9', maxMB: 5  },
  aadhar_front:      { label: 'Aadhar Card (Front)',   accept: 'image/jpeg,image/png,image/webp', icon: <IdcardOutlined />,      single: true,  color: '#389e0d', maxMB: 5  },
  aadhar_back:       { label: 'Aadhar Card (Back)',    accept: 'image/jpeg,image/png,image/webp', icon: <IdcardOutlined />,      single: true,  color: '#389e0d', maxMB: 5  },
  company_agreement: { label: 'Company Agreement',     accept: 'application/pdf,image/jpeg,image/png,image/webp', icon: <FileProtectOutlined />, single: false, color: '#c41d7f', maxMB: 10 },
  other_document:    { label: 'Other Document',        accept: 'application/pdf,image/jpeg,image/png,image/webp', icon: <FileOutlined />,        single: false, color: '#595959', maxMB: 10 },
};

const ENTITY_DOC_TYPES = {
  residence: ['owner_photo', 'property_photo'],
  agreement: ['agreement_pdf'],
  employee:  ['employee_photo', 'aadhar_front', 'aadhar_back', 'company_agreement', 'other_document'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(ext) {
  return ['jpg', 'jpeg', 'png', 'webp'].includes(String(ext || '').toLowerCase());
}

// ─── Single file card ─────────────────────────────────────────────────────────

function FileCard({ file, entityType, entityId, onDelete, readOnly }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading]       = useState(false);
  const streamUrl = `/api/files/${entityType}/${entityId}/${file.file_id}/stream`;

  const handleView = async () => {
    setLoading(true);
    try {
      const res = await api.get(streamUrl, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      if (isImage(file.file_ext)) {
        setPreviewUrl(url);
      } else {
        // PDF: open in new tab
        window.open(url, '_blank');
        // revoke after small delay
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch {
      message.error('Could not load file');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setLoading(true);
    try {
      const res = await api.get(streamUrl, { responseType: 'blob' });
      const url  = URL.createObjectURL(res.data);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = file.original_name || file.stored_filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      message.error('Could not download file');
    } finally {
      setLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const ext   = String(file.file_ext || '').toLowerCase();
  const thumb = isImage(ext);

  return (
    <>
      <Card
        size="small"
        style={{ marginBottom: 8, borderRadius: 8 }}
        bodyStyle={{ padding: '10px 12px' }}
      >
        <Row align="middle" gutter={8} wrap={false}>
          <Col flex="none">
            <div style={{
              width: 40, height: 40, borderRadius: 6, overflow: 'hidden',
              background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {thumb
                ? <FileImageOutlined style={{ fontSize: 22, color: '#1677ff' }} />
                : <FilePdfOutlined   style={{ fontSize: 22, color: '#d46b08' }} />
              }
            </div>
          </Col>
          <Col flex="auto" style={{ minWidth: 0 }}>
            <Text ellipsis style={{ display: 'block', fontWeight: 500, fontSize: 13 }}>
              {file.original_name || file.stored_filename}
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {fmtSize(file.file_size_bytes)}
              {file.uploaded_at ? ` · ${dayjs(file.uploaded_at).format('DD MMM YYYY, HH:mm')}` : ''}
            </Text>
          </Col>
          <Col flex="none">
            <Space size={4}>
              <Tooltip title="View">
                <Button type="text" size="small" icon={<EyeOutlined />} loading={loading} onClick={handleView} />
              </Tooltip>
              <Tooltip title="Download">
                <Button type="text" size="small" icon={<DownloadOutlined />} loading={loading} onClick={handleDownload} />
              </Tooltip>
              {!readOnly && (
                <Popconfirm
                  title="Delete this file?"
                  description="This cannot be undone."
                  onConfirm={() => onDelete(file.file_id)}
                  okText="Delete"
                  okType="danger"
                >
                  <Tooltip title="Delete">
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Tooltip>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Image preview modal */}
      <Modal
        open={!!previewUrl}
        footer={null}
        onCancel={closePreview}
        width={800}
        centered
        title={file.original_name || file.stored_filename}
      >
        {previewUrl && (
          <img
            src={previewUrl}
            alt="preview"
            style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }}
          />
        )}
      </Modal>
    </>
  );
}

// ─── Per doc-type section ─────────────────────────────────────────────────────

function DocTypeSection({ docType, files, entityType, entityId, onDelete, onUpload, readOnly }) {
  const cfg    = DOC_TYPE_CONFIG[docType] || {};
  const single = cfg.single;
  const canAdd = readOnly ? false : (!single || files.length === 0);

  const [uploading,  setUploading]  = useState(false);
  const [uploadPct,  setUploadPct]  = useState(0);
  const fileInputRef = useRef(null);

  const triggerUpload = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // Basic client-side size check
    if (file.size > cfg.maxMB * 1024 * 1024) {
      message.error(`File too large. Maximum ${cfg.maxMB}MB allowed.`);
      return;
    }
    setUploading(true);
    setUploadPct(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(
        `/files/${entityType}/${entityId}/upload?doc_type=${docType}`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (evt) => {
            if (evt.total) setUploadPct(Math.round((evt.loaded * 100) / evt.total));
          },
        }
      );
      message.success(`${cfg.label} uploaded successfully`);
      onUpload();
    } catch (err) {
      message.error(err.response?.data?.error || `Failed to upload ${cfg.label}`);
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space>
          <span style={{ color: cfg.color || '#595959', fontSize: 16 }}>{cfg.icon}</span>
          <Text strong style={{ fontSize: 13 }}>{cfg.label}</Text>
          <Badge count={files.length} showZero={false} style={{ backgroundColor: cfg.color || '#595959' }} />
          {single && files.length > 0 && (
            <Tag color="green" icon={<CheckCircleOutlined />} style={{ fontSize: 11 }}>On file</Tag>
          )}
        </Space>
        {canAdd && (
          <Button
            size="small"
            type="dashed"
            icon={<UploadOutlined />}
            loading={uploading}
            onClick={triggerUpload}
          >
            {single && files.length > 0 ? 'Replace' : 'Upload'}
          </Button>
        )}
      </div>

      {uploading && (
        <Progress percent={uploadPct} size="small" style={{ marginBottom: 8 }} />
      )}

      {files.length === 0 ? (
        <div style={{ background: '#fafafa', borderRadius: 6, padding: '12px 16px', border: '1px dashed #d9d9d9', textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            No {cfg.label.toLowerCase()} uploaded yet
          </Text>
        </div>
      ) : (
        files.map(f => (
          <FileCard
            key={f.file_id}
            file={f}
            entityType={entityType}
            entityId={entityId}
            onDelete={onDelete}
            readOnly={readOnly}
          />
        ))
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={cfg.accept}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const DocumentsPanel = ({
  entityType,
  entityId,
  docTypes: docTypesProp,
  readOnly  = false,
  onFilesChange,
  compact   = false,
}) => {
  const [files,   setFiles]   = useState([]);
  const [loading, setLoading] = useState(false);

  // Determine which doc types to show
  const validTypes  = ENTITY_DOC_TYPES[entityType] || [];
  const docTypes    = docTypesProp
    ? docTypesProp.filter(dt => validTypes.includes(dt))
    : validTypes;

  const fetchFiles = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const res = await api.get(`/files/${entityType}/${entityId}`);
      setFiles(Array.isArray(res.data) ? res.data : []);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleDelete = async (fileId) => {
    try {
      await api.delete(`/files/${entityType}/${entityId}/${fileId}`);
      message.success('File deleted');
      await fetchFiles();
      onFilesChange?.();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to delete file');
    }
  };

  const handleUpload = async () => {
    await fetchFiles();
    onFilesChange?.();
  };

  const filesOf = (dt) => files.filter(f => f.doc_type === dt);

  const totalFiles = files.length;

  return (
    <Spin spinning={loading}>
      <div style={{ padding: compact ? '0' : '4px 0' }}>
        {!compact && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text strong style={{ fontSize: 14, color: '#262626' }}>Documents & Files</Text>
            <Tag>{totalFiles} file{totalFiles !== 1 ? 's' : ''}</Tag>
          </div>
        )}

        {docTypes.length === 0 ? (
          <Empty description="No document types configured" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          docTypes.map((dt, idx) => (
            <React.Fragment key={dt}>
              {idx > 0 && <Divider style={{ margin: '4px 0 16px' }} />}
              <DocTypeSection
                docType={dt}
                files={filesOf(dt)}
                entityType={entityType}
                entityId={entityId}
                onDelete={handleDelete}
                onUpload={handleUpload}
                readOnly={readOnly}
              />
            </React.Fragment>
          ))
        )}
      </div>
    </Spin>
  );
};

export default DocumentsPanel;
