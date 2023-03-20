import { EventEmitter, Injectable } from '@angular/core';
import { NgxImageCompressService } from 'ngx-image-compress';
import { FileProcessed, FileStatus } from '../public_api';

export interface CompressImageConfig {
	orientation: number;
	maxHeight?: number;
	maxWidth?: number;
	quality?: number;
	ratio?: number;
}

export class FileExtended extends File {
	originalSize?: number;
}

export interface FileSelectResult {

	/** The added files, emitted in the filesAdded event. */
	addedFiles: FileExtended[];

	/** The rejected files, emitted in the filesRejected event. */
	rejectedFiles: RejectedFile[];
}

export interface RejectedFile extends File {

	/** The reason the file was rejected. */
	reason?: RejectReason;
}

export type RejectReason = 'type' | 'size' | 'no_multiple';

/**
 * This service contains the filtering logic to be applied to
 * any dropped or selected file. If a file matches all criteria
 * like maximum size or accept type, it will be emitted in the
 * addedFiles array, otherwise in the rejectedFiles array.
 */
@Injectable()
export class NgxDropzoneService {

	constructor(private _ngxImageCompressService: NgxImageCompressService) { }

	async parseFileList(files: FileList, accept: string, maxFileSize: number, multiple: boolean, compress: boolean | CompressImageConfig, onFileProcessed: EventEmitter<FileProcessed>): Promise<FileSelectResult> {

		const rejectedFiles: RejectedFile[] = [];
		const addedFiles: FileExtended[] = [];
		var remainingFilesNumber = files.length;

		const filesArray = Array.from(files);

		for (var file of filesArray) {
			remainingFilesNumber--;

			if (!this.isAccepted(file, accept)) {
				this.rejectFile(rejectedFiles, file, 'type');
				onFileProcessed.emit({ file, remainingFilesNumber, status: FileStatus.REJECTED });
				continue;
			}

			if (!multiple && files.length >= 1) {
				this.rejectFile(rejectedFiles, file, 'no_multiple');
				onFileProcessed.emit({ file, remainingFilesNumber, status: FileStatus.REJECTED });
				continue;
			}

			if (compress && file.type.search('image') != -1) {
				const compressConfig = typeof compress != 'boolean' ? compress : undefined;
				file = await this.compressImage(file, compressConfig);
			}

			if (maxFileSize && file.size > maxFileSize) {
				this.rejectFile(rejectedFiles, file, 'size');
				onFileProcessed.emit({ file, remainingFilesNumber, status: FileStatus.REJECTED });
				continue;
			}

			addedFiles.push(file);
			onFileProcessed.emit({ file, remainingFilesNumber, status: FileStatus.ADDED });
		}

		const result: FileSelectResult = {
			addedFiles,
			rejectedFiles
		};

		return result;
	}

	private isAccepted(file: File, accept: string): boolean {

		if (accept === '*') {
			return true;
		}

		const acceptFiletypes = accept.split(',').map(it => it.toLowerCase().trim());
		const filetype = file.type.toLowerCase();
		const filename = file.name.toLowerCase();

		const matchedFileType = acceptFiletypes.find(acceptFiletype => {

			// check for wildcard mimetype (e.g. image/*)
			if (acceptFiletype.endsWith('/*')) {
				return filetype.split('/')[0] === acceptFiletype.split('/')[0];
			}

			// check for file extension (e.g. .csv)
			if (acceptFiletype.startsWith(".")) {
				return filename.endsWith(acceptFiletype);
			}

			// check for exact mimetype match (e.g. image/jpeg)
			return acceptFiletype == filetype;
		});

		return !!matchedFileType;
	}

	private rejectFile(rejectedFiles: RejectedFile[], file: File, reason: RejectReason) {

		const rejectedFile = file as RejectedFile;
		rejectedFile.reason = reason;

		rejectedFiles.push(rejectedFile);
	}

	private async compressImage(imageFile: File, config: CompressImageConfig = { orientation: -1 }) {
		const base64Image = await this.fileToBase64(imageFile);
		const compressedImageBase64 = await this._ngxImageCompressService.compressFile(
			base64Image,
			config.orientation,
			config.ratio,
			config.quality,
			config.maxWidth,
			config.maxHeight,
		);
		const compressedImageFile = await this.base64ToFile(compressedImageBase64, imageFile.name, imageFile.type);
		compressedImageFile['originalSize'] = imageFile.size;
		return compressedImageFile;
	}

	private fileToBase64(file: File) {
		const reader = new FileReader();
		reader.readAsDataURL(file);
		return (new Promise<string>((resolve, reject) => {
			reader.onloadend = () => {
				if (typeof reader.result == 'string') {
					resolve(reader.result);
				} else {
					reject(reader.result);
				}
			};
		}));
	}

	private async base64ToFile(base64File: string, name: string, type: string) {
		const res: Response = await fetch(base64File);
		const blob: Blob = await res.blob();
		return new File([blob], name, { type });
	}
}
